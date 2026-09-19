# MyAgenda - Rust + Tauri Desktop App

Aplicação desktop desenvolvida em **Rust + Tauri v2** para centralizar e visualizar compromissos do **Google Agenda** e tarefas/demandas do **GitLab** (instância privada ou gitlab.com) em um webkit leve, intuitivo e com paleta de cores personalizada (**#ff8c00**, **#202020**, **#a9a9a9**).

---

## 🎨 Paleta de Cores & Design
- **Laranja Destaque / Brand**: `#ff8c00`
- **Superfície & Cards Escuros**: `#202020` e `#282828`
- **Textos Secundários & Bordas**: `#a9a9a9`
- **Background Principal**: `#141414`

---

## 🚀 Funcionalidades

1. **Visão Mensal (Grid de Calendário)**:
   - Exibição de todos os dias do mês.
   - Destaque para o dia atual.
   - Chips coloridos indicando compromissos do Google Agenda e datas limite de Issues/MRs do GitLab.

2. **Visão Semanal (Horários & Dias)**:
   - Grade dos 7 dias da semana com slots de horário (08:00 às 20:00).
   - Posicionamento intuitivo dos compromissos e entregas.

3. **Visão Diária (Agenda Detalhada)**:
   - Cronograma detalhado do dia selecionado.
   - Painel lateral com lista em destaque das tarefas do GitLab.

4. **Visão GitLab (Board Kanban de Issues & MRs por Tags)**:
   - Alternância rápida entre **Issues** e **Merge Requests (MRs)**.
   - Agrupamento automático nas colunas:
     - 📌 **To Do / Pendentes**
     - ⚡ **Doing / Em Progresso**
     - 🔍 **In Review / Revisão**
     - ✅ **Done / Concluídas**
   - Suporte a filtro por tags (`Doing`, `Done`, `To Do`, `In Review`, etc.).
   - Acesso direto ao link web no GitLab.

5. **Configurações & Modos**:
   - Conectores configuráveis para **GitLab Privado** (Host URL, Token PSA e Usuário) com botão de **Teste de Conexão**.
   - Conector para **Google Agenda v3 API** (Calendar ID e API Key/Token OAuth2).
   - **Modo Demo automático**: Permite testar a interface imediatamente mesmo sem credenciais preenchidas.

---

## 🛠️ Como Executar

### 1. Pré-requisitos no Linux (Fedora/Ubuntu/Debian)
Caso deseje compilar o binário nativo com o webkit do Tauri no Fedora, certifique-se de ter os pacotes de desenvolvimento instalados:
```bash
sudo dnf install -y gtk3-devel webkit2gtk4.1-devel openssl-devel librsvg2-devel
```

### 2. Modo Desenvolvimento (Webview / Frontend)
Para rodar o frontend em modo desenvolvimento rápido no navegador/webview:
```bash
npm run dev
```

### 3. Modo Desktop Tauri
Para executar a aplicação desktop Tauri nativa em Rust:
```bash
npm run tauri dev
```

### 4. Build de Produção
Para compilar os arquivos otimizados e gerar o instalador desktop:
```bash
npm run build
npm run tauri build
```

---

## ⚙️ Configuração dos Tokens

### GitLab Privado
1. No seu GitLab privado, acesse: `User Settings` -> `Access Tokens`.
2. Crie um **Personal Access Token** (Token PSA) com os escopos `read_api` e `read_repository`.
3. Abra as **Configurações** na aplicação e preencha:
   - **Host**: `https://gitlab.suaempresa.com.br`
   - **Token**: `glpat-xxxxxxxxxxxxxxxx`
   - **Usuário**: seu username no GitLab (ex: `schwaad`).
4. Clique em **Testar Conexão GitLab** e depois em **Salvar & Sincronizar**.

### Google Agenda
1. Insira o ID da sua agenda (ex: `primary` ou seu e-mail).
2. Insira sua **Google API Key** ou **OAuth Bearer Token**.
3. Clique em **Salvar & Sincronizar**.
