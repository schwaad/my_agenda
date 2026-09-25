# MyAgenda

Aplicativo desktop feito com Rust, Tauri, TypeScript e Vite para reunir compromissos do Google Agenda, tarefas do Google Tasks, issues e merge requests do GitLab e ferramentas pessoais de organização.

## Funcionalidades

- Agenda mensal, semanal e diária com eventos do Google Agenda e itens do GitLab.
- Quadro GitLab para visualizar issues e merge requests por estado e etiqueta.
- Google Tasks exibido junto aos compromissos quando o token OAuth possui o escopo necessário.
- Anotações locais em Markdown, com busca, edição e visualização segura.
- Lista local de afazeres com prazo, filtros e controle de conclusão.
- Cronograma semanal local em intervalos de 15 minutos.
- Timer de foco e descanso com durações configuráveis.
- Modo de demonstração para conhecer a interface sem configurar integrações.

## Requisitos

Para desenvolvimento e compilação:

- Node.js 22.13 ou mais recente e npm.
- Rust estável, Cargo e o target da plataforma instalados pelo `rustup`.
- Dependências nativas exigidas pelo Tauri 2.
- Uma sessão gráfica Linux para executar a versão desktop.

No Fedora, instale as dependências nativas usadas pelo projeto:

```bash
sudo dnf install -y gtk3-devel webkit2gtk4.1-devel openssl-devel librsvg2-devel
```

Em seguida, instale as dependências JavaScript:

```bash
npm install
```

Para usar as integrações, você também precisará de acesso a uma instância GitLab e/ou a credenciais da API do Google. As ferramentas locais funcionam sem essas contas.

## Executar a aplicação

### Aplicativo desktop em desenvolvimento

```bash
npm run debug
```

Esse é o fluxo recomendado para desenvolvimento. O Tauri abre a janela desktop e o Vite atualiza o frontend por HMR. `npm start` executa o mesmo fluxo.

Se houver problemas de renderização no Linux, teste:

```bash
npm run tauri:dev
```

Em ambientes Hyprland/Wayland, também está disponível:

```bash
npm run tauri:hyprland
```

### Frontend no navegador

```bash
npm run dev
```

Abra o endereço informado pelo Vite no terminal, normalmente `http://localhost:1420`. Esse modo é útil para trabalhar na interface e nas funcionalidades locais. As integrações GitLab e Google dependem dos comandos do backend Tauri e, portanto, devem ser validadas no aplicativo desktop.

### Binário standalone existente

Se você recebeu ou gerou o binário otimizado:

```bash
chmod +x ./my_agenda
./my_agenda
```

## Compilar e empacotar

Gerar somente o frontend em `dist/`:

```bash
npm run build
```

Gerar um executável desktop de depuração na raiz do projeto:

```bash
npm run build:debug
./my_agenda-debug
```

Gerar o executável standalone otimizado `my_agenda`:

```bash
npm run build:release
./my_agenda
```

Gerar a distribuição oficial, incluindo os pacotes DEB e RPM configurados no Tauri:

```bash
npm run build:official
```

Os artefatos intermediários do Rust ficam em `src-tauri/target/`. Os executáveis copiados para a raiz são artefatos locais e não devem ser enviados ao Git.

## Configurar as integrações

Abra **Configurações** dentro do aplicativo para informar as credenciais. Não coloque tokens ou segredos diretamente no código, no README ou em arquivos versionados.

### GitLab

Informe:

- **Host**: endereço da instância, por exemplo `https://gitlab.example.com`.
- **Token**: Personal Access Token com permissão de leitura para projetos, issues e merge requests que deseja consultar.
- **Usuário**: nome de usuário usado para filtrar e identificar os itens.

Use **Testar Conexão GitLab** antes de carregar os dados. Conceda ao token somente os escopos estritamente necessários.

### Google Agenda e Google Tasks

Informe o ID do calendário, `primary` ou o e-mail associado. A autenticação aceita:

- API Key, para calendários acessíveis por esse mecanismo.
- OAuth Access Token.
- OAuth Refresh Token, acompanhado do Client ID e Client Secret correspondentes.
- URL iCal/ICS, quando aplicável.

O Google Tasks exige autenticação OAuth e o escopo de leitura de tarefas. Uma API Key ou URL iCal não fornece acesso ao Google Tasks. Use **Testar Conexão Google Agenda** para conferir a configuração.

## Como usar

### Navegação

O menu principal alterna entre **Agenda**, **Organizar** e **GitLab**. As setas laterais percorrem essas seções e abrem a primeira visualização de cada uma.

### Agenda

Use as visões mensal, semanal e diária para consultar compromissos, tarefas e itens do GitLab. Selecione um item para abrir seus detalhes. Descrições Markdown aceitam títulos, listas, tabelas, caixas de tarefa, links, imagens e blocos de código.

### GitLab

O quadro separa issues e merge requests. Use as abas e o filtro de etiquetas para reduzir os resultados. Ao abrir um cartão, a descrição é renderizada em Markdown e links relativos usam o projeto GitLab como base.

### Anotações

Crie uma nota, informe título e conteúdo Markdown e use **Alterar** para alternar da leitura renderizada para a edição. As notas são salvas automaticamente e podem ser buscadas ou excluídas.

### Afazeres

Crie tarefas com prazo, marque-as como concluídas, altere datas e filtre itens pendentes ou concluídos. Essa lista é independente do Google Tasks.

### Meu cronograma

A grade cobre segunda a domingo, das 06:00 às 23:45, em intervalos de 15 minutos. Arraste para selecionar vários horários, use Shift para ampliar um intervalo ou Ctrl/Cmd para combinar células. Depois, preencha ou limpe toda a seleção.

### Timer

Defina as durações de foco e descanso e use os controles para iniciar, pausar ou reiniciar. Ao concluir um período, o aplicativo toca um aviso e prepara o próximo ciclo.

## Persistência e privacidade

Configurações, tokens e dados das ferramentas pessoais ficam no armazenamento local da aplicação. Eles não são sincronizados automaticamente entre dispositivos. O navegador e o aplicativo desktop usam armazenamentos separados; limpar os dados do navegador ou da aplicação remove esse conteúdo.

Evite usar o modo web em um perfil compartilhado. Tokens atuais são armazenados localmente sem criptografia adicional, então proteja a conta do sistema e revogue imediatamente qualquer credencial que possa ter sido exposta.

Chaves de armazenamento utilizadas:

- `my_agenda_config`: integrações e configurações.
- `my_agenda_notes`: anotações.
- `my_agenda_tasks`: afazeres.
- `my_agenda_schedule`: cronograma.
- `my_agenda_timer`: preferências do timer.

## Validação

Executar os testes automatizados:

```bash
npm test
```

Validar tipos e a compilação do frontend:

```bash
npm run build
```

Os testes cobrem renderização e sanitização de Markdown, navegação, persistência local e falhas de armazenamento. O HTML renderizado é sanitizado com DOMPurify; extensões específicas do GitLab, como menções automáticas e diagramas Mermaid, não são interpretadas.
