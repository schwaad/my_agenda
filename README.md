# MyAgenda

(vibecoded) Rust + Tauri application to organize my Google Agenda and Gitlab Issues so I don't forget tasks nor go insane

---

## Running the program

### 1. Install dependencies
```bash
sudo dnf install -y gtk3-devel webkit2gtk4.1-devel openssl-devel librsvg2-devel
```

### 2. Development mode
```bash
npm run dev
```

### 3. Desktop application mode
```bash
npm run tauri dev
```

### 4. Build Prod. version
```bash
npm run build
npm run tauri build
```

---

## Token Config

### GitLab 

1. Generate your Personal Access Token with read permissions for Issues, MRs and Repositories.
2. Open **Configurações** and insert:
   - **Host**
   - **Token**
   - **Usuário**

### Google Calendar
1. Insert your Calendar ID or your e-mail
2. Open **Configurações** and insert your Google API Key or OAuth Bearer Token
