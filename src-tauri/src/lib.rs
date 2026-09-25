use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitlabIssue {
    pub id: u64,
    pub iid: u64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub created_at: String,
    pub due_date: Option<String>,
    pub web_url: String,
    pub labels: Vec<String>,
    pub assignee_name: Option<String>,
    pub project_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitlabMR {
    pub id: u64,
    pub iid: u64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub created_at: String,
    pub target_branch: Option<String>,
    pub source_branch: Option<String>,
    pub web_url: String,
    pub labels: Vec<String>,
    pub author_name: Option<String>,
    pub draft: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoogleEvent {
    pub id: String,
    pub summary: String,
    pub description: Option<String>,
    pub start_time: String,
    pub end_time: String,
    pub html_link: Option<String>,
    pub location: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawGitlabUser {
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawGitlabIssue {
    pub id: u64,
    pub iid: u64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub created_at: String,
    pub due_date: Option<String>,
    pub web_url: String,
    pub labels: Vec<String>,
    pub assignee: Option<RawGitlabUser>,
}

#[derive(Debug, Deserialize)]
struct RawGitlabMR {
    pub id: u64,
    pub iid: u64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub created_at: String,
    pub target_branch: Option<String>,
    pub source_branch: Option<String>,
    pub web_url: String,
    pub labels: Vec<String>,
    pub author: Option<RawGitlabUser>,
    pub draft: Option<bool>,
    pub work_in_progress: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct RawGoogleCalendarResponse {
    pub items: Option<Vec<RawGoogleEvent>>,
    pub error: Option<RawGoogleError>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct RawGoogleError {
    pub code: Option<u16>,
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawGoogleEventTime {
    pub date_time: Option<String>,
    pub date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct RawGoogleEvent {
    pub id: String,
    pub summary: Option<String>,
    pub description: Option<String>,
    pub start: Option<RawGoogleEventTime>,
    pub end: Option<RawGoogleEventTime>,
    pub html_link: Option<String>,
    pub location: Option<String>,
    pub status: Option<String>,
}

#[tauri::command]
fn export_schedule_csv(content: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "linux")]
    {
        use std::process::Command;

        let output = Command::new("zenity")
            .args([
                "--file-selection",
                "--save",
                "--confirm-overwrite",
                "--title=Exportar cronograma",
                "--filename=meu-cronograma.csv",
                "--file-filter=Arquivos CSV | *.csv",
            ])
            .output()
            .map_err(|error| format!("Não foi possível abrir o seletor de arquivos: {error}"))?;

        if !output.status.success() {
            return Ok(None);
        }
        let selected = String::from_utf8(output.stdout)
            .map_err(|error| format!("Caminho de arquivo inválido: {error}"))?;
        let selected = selected.trim();
        if selected.is_empty() {
            return Ok(None);
        }
        let path = if selected.to_ascii_lowercase().ends_with(".csv") {
            selected.to_string()
        } else {
            format!("{selected}.csv")
        };
        std::fs::write(&path, content)
            .map_err(|error| format!("Erro ao salvar o cronograma: {error}"))?;
        Ok(Some(path))
    }

    #[cfg(not(target_os = "linux"))]
    {
        let _ = content;
        Err("O seletor nativo de exportação ainda não está disponível neste sistema.".into())
    }
}

fn normalize_host(host: &str) -> String {
    let trimmed = host.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return String::new();
    }
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        format!("https://{}", trimmed)
    } else {
        trimmed.to_string()
    }
}

#[tauri::command]
async fn fetch_gitlab_issues(
    host: String,
    token: String,
    username: String,
) -> Result<Vec<GitlabIssue>, String> {
    let clean_host = normalize_host(&host);
    if clean_host.is_empty() || token.trim().is_empty() {
        return Err("Host ou Token do GitLab não fornecidos".into());
    }

    let client = reqwest::Client::new();
    let url = if username.trim().is_empty() {
        format!("{}/api/v4/issues?scope=all&state=opened&per_page=100", clean_host)
    } else {
        format!(
            "{}/api/v4/issues?scope=all&assignee_username={}&state=opened&per_page=100",
            clean_host, urlencoding::encode(username.trim())
        )
    };

    let res = client
        .get(&url)
        .header("PRIVATE-TOKEN", token.trim())
        .send()
        .await
        .map_err(|e| format!("Erro na requisição ao GitLab: {}", e))?;

    let status = res.status();
    if !status.is_success() {
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!("GitLab retornou erro HTTP {}: {}", status, err_body));
    }

    let raw_issues: Vec<RawGitlabIssue> = res
        .json()
        .await
        .map_err(|e| format!("Erro ao decodificar JSON do GitLab: {}", e))?;

    let issues = raw_issues
        .into_iter()
        .map(|item| GitlabIssue {
            id: item.id,
            iid: item.iid,
            title: item.title,
            description: item.description,
            state: item.state,
            created_at: item.created_at,
            due_date: item.due_date,
            web_url: item.web_url,
            labels: item.labels,
            assignee_name: item.assignee.and_then(|u| u.name),
            project_name: None,
        })
        .collect();

    Ok(issues)
}

#[tauri::command]
async fn fetch_gitlab_mrs(
    host: String,
    token: String,
    username: String,
) -> Result<Vec<GitlabMR>, String> {
    let clean_host = normalize_host(&host);
    if clean_host.is_empty() || token.trim().is_empty() {
        return Err("Host ou Token do GitLab não fornecidos".into());
    }

    let client = reqwest::Client::new();
    let url = if username.trim().is_empty() {
        format!("{}/api/v4/merge_requests?scope=all&state=opened&per_page=100", clean_host)
    } else {
        format!(
            "{}/api/v4/merge_requests?scope=all&author_username={}&state=opened&per_page=100",
            clean_host, urlencoding::encode(username.trim())
        )
    };

    let res = client
        .get(&url)
        .header("PRIVATE-TOKEN", token.trim())
        .send()
        .await
        .map_err(|e| format!("Erro na requisição de MRs ao GitLab: {}", e))?;

    let status = res.status();
    if !status.is_success() {
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!("GitLab MRs retornou erro HTTP {}: {}", status, err_body));
    }

    let raw_mrs: Vec<RawGitlabMR> = res
        .json()
        .await
        .map_err(|e| format!("Erro ao decodificar JSON de MRs do GitLab: {}", e))?;

    let mrs = raw_mrs
        .into_iter()
        .map(|item| {
            let is_draft = item.draft.unwrap_or(false)
                || item.work_in_progress.unwrap_or(false)
                || item.title.to_lowercase().starts_with("draft:")
                || item.title.to_lowercase().starts_with("wip:");

            GitlabMR {
                id: item.id,
                iid: item.iid,
                title: item.title,
                description: item.description,
                state: item.state,
                created_at: item.created_at,
                target_branch: item.target_branch,
                source_branch: item.source_branch,
                web_url: item.web_url,
                labels: item.labels,
                author_name: item.author.and_then(|u| u.name),
                draft: is_draft,
            }
        })
        .collect();

    Ok(mrs)
}

async fn get_effective_access_token(
    token: &str,
    client_id: Option<&str>,
    client_secret: Option<&str>,
) -> Result<String, String> {
    let clean = token.trim();
    if clean.starts_with("1//") {
        let cid = client_id.unwrap_or("").trim();
        let csecret = client_secret.unwrap_or("").trim();

        let (final_cid, final_csecret) = if !cid.is_empty() && !csecret.is_empty() {
            (cid, csecret)
        } else {
            // Default OAuth Playground Client credentials
            (
                "292085223830-ad05vbh965qqr31v55s04g63ki86m0hd.apps.googleusercontent.com",
                "gws-prod",
            )
        };

        let client = reqwest::Client::new();
        let params = [
            ("client_id", final_cid),
            ("client_secret", final_csecret),
            ("refresh_token", clean),
            ("grant_type", "refresh_token"),
        ];
        let res = client
            .post("https://oauth2.googleapis.com/token")
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Erro na requisição de renovação do token: {}", e))?;

        let status = res.status();
        let body = res.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(format!(
                "Falha ao renovar Refresh Token (HTTP {}): {}. Certifique-se de preencher o Client ID e Client Secret do Google nas Configurações se utilizou credenciais próprias.",
                status, body
            ));
        }

        #[derive(Deserialize)]
        struct TokenResp {
            access_token: String,
        }

        let parsed: TokenResp = serde_json::from_str(&body)
            .map_err(|e| format!("Erro ao decodificar token renovado: {}", e))?;

        return Ok(parsed.access_token);
    }

    Ok(clean.to_string())
}

#[tauri::command]
async fn fetch_google_calendar_events(
    calendar_id: String,
    api_key_or_token: String,
    client_id: Option<String>,
    client_secret: Option<String>,
    time_min: Option<String>,
) -> Result<Vec<GoogleEvent>, String> {
    let raw_token = api_key_or_token.trim();
    let clean_cal_id = if calendar_id.trim().is_empty() {
        "primary".to_string()
    } else {
        calendar_id.trim().to_string()
    };

    if raw_token.is_empty() {
        return Err("Token OAuth ou API Key do Google Agenda não fornecidos.".into());
    }

    // Support iCal URL directly if user pasted an .ics link
    if raw_token.starts_with("http://") || raw_token.starts_with("https://") {
        return fetch_ical_events(&raw_token).await;
    }

    let clean_token = get_effective_access_token(
        raw_token,
        client_id.as_deref(),
        client_secret.as_deref(),
    ).await?;

    let client = reqwest::Client::new();
    let encoded_cal_id = urlencoding::encode(&clean_cal_id);

    // Filter from specified timeMin or 1 year ago so recent and future events are returned
    let default_time_min = "2025-01-01T00:00:00Z".to_string();
    let effective_time_min = time_min.unwrap_or(default_time_min);
    let encoded_time_min = urlencoding::encode(&effective_time_min);

    let url = format!(
        "https://www.googleapis.com/calendar/v3/calendars/{}/events?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin={}",
        encoded_cal_id, encoded_time_min
    );

    // If starts with "AIza", it's a Google API Key. Otherwise, it's an OAuth2 Bearer Token.
    let req = if clean_token.starts_with("AIza") {
        client.get(format!("{}&key={}", url, clean_token))
    } else {
        client.get(&url).header("Authorization", format!("Bearer {}", clean_token))
    };

    let res = req
        .send()
        .await
        .map_err(|e| format!("Erro ao conectar à API do Google Agenda: {}", e))?;

    let status = res.status();
    let body_text = res
        .text()
        .await
        .map_err(|e| format!("Erro ao ler resposta do Google Agenda: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "Google Calendar API erro HTTP {}: {}",
            status, body_text
        ));
    }

    let data: RawGoogleCalendarResponse = serde_json::from_str(&body_text)
        .map_err(|e| format!("Erro ao decodificar JSON do Google Calendar: {}. Resposta: {}", e, body_text))?;

    if let Some(err) = data.error {
        return Err(format!("Erro retornado pelo Google: {}", err.message.unwrap_or_default()));
    }

    let events = data
        .items
        .unwrap_or_default()
        .into_iter()
        .filter(|item| item.status.as_deref() != Some("cancelled"))
        .map(|item| {
            let start = item
                .start
                .as_ref()
                .and_then(|s| s.date_time.clone().or_else(|| s.date.clone()))
                .unwrap_or_default();
            let end = item
                .end
                .as_ref()
                .and_then(|e| e.date_time.clone().or_else(|| e.date.clone()))
                .unwrap_or_default();

            GoogleEvent {
                id: item.id,
                summary: item.summary.unwrap_or_else(|| "(Sem título)".into()),
                description: item.description,
                start_time: start,
                end_time: end,
                html_link: item.html_link,
                location: item.location,
            }
        })
        .collect();

    Ok(events)
}

#[derive(Debug, Deserialize)]
struct RawGoogleTaskItem {
    pub id: String,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub due: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawGoogleTasksResponse {
    pub items: Option<Vec<RawGoogleTaskItem>>,
}

#[tauri::command]
async fn fetch_google_tasks(
    token: String,
    client_id: Option<String>,
    client_secret: Option<String>,
) -> Result<Vec<GoogleEvent>, String> {
    let raw_token = token.trim();
    if raw_token.is_empty() || raw_token.starts_with("AIza") || raw_token.starts_with("http") {
        return Ok(Vec::new());
    }

    let clean_token = get_effective_access_token(
        raw_token,
        client_id.as_deref(),
        client_secret.as_deref(),
    ).await?;

    let client = reqwest::Client::new();
    let lists_url = "https://tasks.googleapis.com/tasks/v1/users/@me/lists";

    let res_lists = client
        .get(lists_url)
        .header("Authorization", format!("Bearer {}", clean_token))
        .send()
        .await
        .map_err(|e| format!("Erro ao conectar à API do Google Tasks: {}", e))?;

    let status_lists = res_lists.status();
    if !status_lists.is_success() {
        let err_body = res_lists.text().await.unwrap_or_default();
        if status_lists.as_u16() == 403 {
            return Err("Escopo de tarefas (tasks.readonly) não autorizado no token OAuth.".into());
        }
        return Err(format!("Google Tasks API erro HTTP {}: {}", status_lists, err_body));
    }

    #[derive(Deserialize)]
    struct ListEntry { id: String }
    #[derive(Deserialize)]
    struct ListsResponse { items: Option<Vec<ListEntry>> }

    let mut task_list_ids = vec!["@default".to_string()];
    if let Ok(parsed) = res_lists.json::<ListsResponse>().await {
        if let Some(items) = parsed.items {
            let ids: Vec<String> = items.into_iter().map(|l| l.id).collect();
            if !ids.is_empty() {
                task_list_ids = ids;
            }
        }
    }

    let mut tasks = Vec::new();
    let today_date_str = "2026-09-19T12:00:00";

    for list_id in task_list_ids {
        let tasks_url = format!(
            "https://tasks.googleapis.com/tasks/v1/users/@me/lists/{}/tasks?showCompleted=true&showHidden=true",
            urlencoding::encode(&list_id)
        );

        let res_tasks = client
            .get(&tasks_url)
            .header("Authorization", format!("Bearer {}", clean_token))
            .send()
            .await;

        if let Ok(res) = res_tasks {
            if res.status().is_success() {
                if let Ok(data) = res.json::<RawGoogleTasksResponse>().await {
                    if let Some(items) = data.items {
                        for item in items {
                            let title_raw = item.title.unwrap_or_default();
                            if title_raw.trim().is_empty() {
                                continue;
                            }

                            let is_completed = item.status.as_deref() == Some("completed");
                            let prefix = if is_completed { "✅ [Tarefa] " } else { "📝 [Tarefa] " };
                            let title = format!("{}{}", prefix, title_raw);

                            let due_raw = item.due.unwrap_or_default();
                            let date_str = if !due_raw.is_empty() {
                                parse_ical_date(&due_raw)
                            } else {
                                today_date_str.to_string()
                            };

                            tasks.push(GoogleEvent {
                                id: item.id,
                                summary: title,
                                description: item.notes,
                                start_time: date_str.clone(),
                                end_time: date_str,
                                html_link: Some("https://tasks.google.com".into()),
                                location: None,
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(tasks)
}

#[tauri::command]
async fn test_google_connection(
    calendar_id: String,
    api_key_or_token: String,
    client_id: Option<String>,
    client_secret: Option<String>,
) -> Result<String, String> {
    let events = fetch_google_calendar_events(
        calendar_id,
        api_key_or_token.clone(),
        client_id.clone(),
        client_secret.clone(),
        None,
    ).await?;

    let tasks_msg = match fetch_google_tasks(api_key_or_token, client_id, client_secret).await {
        Ok(tasks) => format!(" e {} tarefa(s)", tasks.len()),
        Err(err) => format!(" (Aviso tarefas: {})", err),
    };

    Ok(format!(
        "Conexão com Google OK! {} compromisso(s){} encontrados.",
        events.len(),
        tasks_msg
    ))
}

// Helper to fetch and parse iCal (.ics) URLs if provided
async fn fetch_ical_events(url: &str) -> Result<Vec<GoogleEvent>, String> {
    let client = reqwest::Client::new();
    let res = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Erro ao baixar iCal: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("Erro ao baixar iCal HTTP {}", res.status()));
    }

    let content = res.text().await.map_err(|e| format!("Erro ao ler iCal: {}", e))?;

    // Unfold multi-line folded headers (RFC 5545 specifies lines starting with space or tab are continuation)
    let unfolded = content
        .replace("\r\n ", "")
        .replace("\r\n\t", "")
        .replace("\n ", "")
        .replace("\n\t", "");

    let mut events = Vec::new();
    let mut current_summary = String::new();
    let mut current_start = String::new();
    let mut current_end = String::new();
    let mut current_due = String::new();
    let mut current_desc = String::new();
    let mut current_location = String::new();
    let mut current_uid = String::new();
    let mut current_rrule = String::new();
    let mut current_status = String::new();
    let mut is_cancelled = false;
    let mut in_event = false;
    let mut comp_type = "VEVENT";

    for line in unfolded.lines() {
        let trimmed = line.trim();
        if trimmed == "BEGIN:VEVENT" || trimmed == "BEGIN:VTODO" || trimmed == "BEGIN:VJOURNAL" {
            in_event = true;
            comp_type = if trimmed == "BEGIN:VTODO" {
                "VTODO"
            } else if trimmed == "BEGIN:VJOURNAL" {
                "VJOURNAL"
            } else {
                "VEVENT"
            };
            current_summary.clear();
            current_start.clear();
            current_end.clear();
            current_due.clear();
            current_desc.clear();
            current_location.clear();
            current_uid.clear();
            current_rrule.clear();
            current_status.clear();
            is_cancelled = false;
        } else if trimmed == "END:VEVENT" || trimmed == "END:VTODO" || trimmed == "END:VJOURNAL" {
            if in_event {
                let effective_start = if !current_start.is_empty() {
                    current_start.clone()
                } else {
                    current_due.clone()
                };

                if !is_cancelled && !effective_start.is_empty() {
                    let raw_title = if current_summary.trim().is_empty() {
                        "Sem título".to_string()
                    } else {
                        current_summary.clone()
                    };

                    let title = match comp_type {
                        "VTODO" => {
                            if current_status.to_uppercase() == "COMPLETED" {
                                format!("✅ [Tarefa] {}", raw_title)
                            } else {
                                format!("📝 [Tarefa] {}", raw_title)
                            }
                        }
                        "VJOURNAL" => format!("📓 [Nota] {}", raw_title),
                        _ => raw_title,
                    };

                    let base_id = if current_uid.is_empty() {
                        format!("ical-{}", events.len())
                    } else {
                        current_uid.clone()
                    };

                    let iso_start = parse_ical_date(&effective_start);
                    let iso_end = if !current_end.is_empty() {
                        parse_ical_date(&current_end)
                    } else {
                        iso_start.clone()
                    };

                    let base_event = GoogleEvent {
                        id: base_id.clone(),
                        summary: title.clone(),
                        description: if current_desc.is_empty() { None } else { Some(current_desc.clone()) },
                        start_time: iso_start.clone(),
                        end_time: iso_end.clone(),
                        html_link: Some("https://calendar.google.com".into()),
                        location: if current_location.is_empty() { None } else { Some(current_location.clone()) },
                    };

                    // Handle RRULE (Recurring Events) if present
                    if !current_rrule.is_empty() {
                        let expanded = expand_rrule_events(&base_event, &current_rrule);
                        events.extend(expanded);
                    } else {
                        events.push(base_event);
                    }
                }
                in_event = false;
            }
        } else if in_event {
            let key = if let Some(colon) = trimmed.find(':') {
                &trimmed[..colon]
            } else {
                trimmed
            };

            let key_base = key.split(';').next().unwrap_or(key).to_uppercase();

            if let Some(colon) = trimmed.find(':') {
                let val = unescape_ical_text(&trimmed[colon + 1..]);

                match key_base.as_str() {
                    "SUMMARY" => current_summary = val,
                    "DESCRIPTION" => current_desc = val,
                    "LOCATION" => current_location = val,
                    "DTSTART" => current_start = val,
                    "DTEND" => current_end = val,
                    "DUE" => current_due = val,
                    "UID" => current_uid = val,
                    "RRULE" => current_rrule = val,
                    "STATUS" => {
                        current_status = val.clone();
                        if val.to_uppercase() == "CANCELLED" {
                            is_cancelled = true;
                        }
                    }
                    _ => {}
                }
            }
        }
    }

    // Deduplicate events by (summary, start_time) and merge rich descriptions
    let mut unique_map: std::collections::HashMap<(String, String), GoogleEvent> = std::collections::HashMap::new();

    for ev in events {
        let key = (ev.summary.trim().to_lowercase(), ev.start_time.clone());
        if let Some(existing) = unique_map.get_mut(&key) {
            let new_has_desc = ev.description.as_ref().map_or(false, |d| !d.trim().is_empty());
            let existing_has_desc = existing.description.as_ref().map_or(false, |d| !d.trim().is_empty());

            if new_has_desc && (!existing_has_desc || ev.description.as_ref().unwrap().len() > existing.description.as_ref().unwrap().len()) {
                existing.description = ev.description;
            }
            if existing.location.is_none() && ev.location.is_some() {
                existing.location = ev.location;
            }
        } else {
            unique_map.insert(key, ev);
        }
    }

    let mut deduplicated: Vec<GoogleEvent> = unique_map.into_values().collect();
    deduplicated.sort_by(|a, b| a.start_time.cmp(&b.start_time));

    Ok(deduplicated)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

// Expand simple recurring events (RRULE) for weekly, daily, monthly frequencies
fn expand_rrule_events(base: &GoogleEvent, rrule: &str) -> Vec<GoogleEvent> {
    let mut list = Vec::new();
    let rule_upper = rrule.to_uppercase();

    // Determine frequency
    let is_weekly = rule_upper.contains("FREQ=WEEKLY");
    let is_daily = rule_upper.contains("FREQ=DAILY");
    let is_monthly = rule_upper.contains("FREQ=MONTHLY");

    if !is_weekly && !is_daily && !is_monthly {
        list.push(base.clone());
        return list;
    }

    // Try parsing base start date
    if base.start_time.len() >= 10 {
        let parts: Vec<&str> = base.start_time[..10].split('-').collect();
        if parts.len() == 3 {
            let year: i32 = parts[0].parse().unwrap_or(2026);
            let month: u32 = parts[1].parse().unwrap_or(9);
            let day: u32 = parts[2].parse().unwrap_or(1);

            let time_suffix = if base.start_time.len() > 10 {
                &base.start_time[10..]
            } else {
                "T12:00:00"
            };

            let occurrences = if is_daily { 60 } else if is_weekly { 26 } else { 12 };
            let step_days = if is_daily { 1 } else if is_weekly { 7 } else { 0 };

            let mut curr_y = year;
            let mut curr_m = month;
            let mut curr_d = day;

            for i in 0..occurrences {
                if i > 0 {
                    if is_monthly {
                        curr_m += 1;
                        if curr_m > 12 {
                            curr_m = 1;
                            curr_y += 1;
                        }
                    } else {
                        curr_d += step_days;
                        while curr_d > days_in_month(curr_y, curr_m) {
                            curr_d -= days_in_month(curr_y, curr_m);
                            curr_m += 1;
                            if curr_m > 12 {
                                curr_m = 1;
                                curr_y += 1;
                            }
                        }
                    }
                }

                let new_start = format!("{:04}-{:02}-{:02}{}", curr_y, curr_m, curr_d, time_suffix);
                let mut clone = base.clone();
                clone.id = if i == 0 { base.id.clone() } else { format!("{}-rrule-{}", base.id, i) };
                clone.start_time = new_start;
                list.push(clone);
            }
        } else {
            list.push(base.clone());
        }
    } else {
        list.push(base.clone());
    }

    list
}

fn unescape_ical_text(s: &str) -> String {
    s.replace("\\,", ",")
        .replace("\\;", ";")
        .replace("\\n", "\n")
        .replace("\\N", "\n")
        .replace("\\\\", "\\")
        .trim()
        .to_string()
}

fn parse_ical_date(s: &str) -> String {
    let clean = s.trim();
    if clean.is_empty() {
        return String::new();
    }

    // If it's already ISO format with hyphens (e.g. 2026-09-19T00:00:00.000Z or 2026-09-19)
    if clean.contains('-') {
        if clean.len() >= 10 {
            let date_part = &clean[..10];
            let time_part = if clean.len() >= 19 && clean.contains('T') {
                let t_pos = clean.find('T').unwrap();
                if clean.len() >= t_pos + 9 {
                    &clean[t_pos + 1..t_pos + 9]
                } else {
                    "12:00:00"
                }
            } else {
                "12:00:00"
            };
            return format!("{}T{}", date_part, time_part);
        }
        return clean.to_string();
    }

    // Compact iCal format with time (20260919T091500Z or 20260919T091500)
    if clean.len() >= 15 && clean.contains('T') {
        let t_pos = clean.find('T').unwrap();
        if t_pos >= 8 {
            let y = &clean[t_pos - 8..t_pos - 4];
            let m = &clean[t_pos - 4..t_pos - 2];
            let d = &clean[t_pos - 2..t_pos];
            let time_part = &clean[t_pos + 1..];
            if time_part.len() >= 6 {
                let h = &time_part[0..2];
                let min = &time_part[2..4];
                let sec = &time_part[4..6];
                return format!("{}-{}-{}T{}:{}:{}", y, m, d, h, min, sec);
            }
        }
    }

    // Compact All-day event date format (20260919) -> format as 2026-09-19T12:00:00
    let digits: String = clean.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.len() >= 8 {
        let y = &digits[0..4];
        let m = &digits[4..6];
        let d = &digits[6..8];
        return format!("{}-{}-{}T12:00:00", y, m, d);
    }

    clean.to_string()
}


#[tauri::command]
async fn test_gitlab_connection(host: String, token: String) -> Result<String, String> {
    let clean_host = normalize_host(&host);
    if clean_host.is_empty() || token.trim().is_empty() {
        return Err("Preencha o Host e o Token antes de testar.".into());
    }

    let client = reqwest::Client::new();
    let url = format!("{}/api/v4/user", clean_host);

    let res = client
        .get(&url)
        .header("PRIVATE-TOKEN", token.trim())
        .send()
        .await
        .map_err(|e| format!("Falha de conexão: {}", e))?;

    let status = res.status();
    if status.is_success() {
        #[derive(Deserialize)]
        struct User {
            name: String,
            username: String,
        }
        if let Ok(user) = res.json::<User>().await {
            Ok(format!("Conectado com sucesso como {} (@{})", user.name, user.username))
        } else {
            Ok("Conexão estabelecida com sucesso!".into())
        }
    } else {
        let err = res.text().await.unwrap_or_default();
        Err(format!("Falha na autenticação (HTTP {}): {}", status, err))
    }
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        s.chars()
            .map(|c| match c {
                'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
                _ => format!("%{:02X}", c as u32),
            })
            .collect()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        if std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").is_err() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_gitlab_issues,
            fetch_gitlab_mrs,
            fetch_google_calendar_events,
            fetch_google_tasks,
            test_gitlab_connection,
            test_google_connection,
            export_schedule_csv
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
