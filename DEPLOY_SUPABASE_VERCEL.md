# Publicar o Gestão de Pagamentos com Supabase e Vercel

O projeto está preparado para funcionar em dois modos:

- **Demonstração:** quando as variáveis do Supabase não existem, permite testar a interface sem salvar dados.
- **Produção:** quando as variáveis estão configuradas, exige login e salva boletos e cheques no Supabase.

## 1. Criar o projeto no Supabase

1. Acesse [database.new](https://database.new/) e crie um projeto.
2. No painel do projeto, abra **SQL Editor**.
3. Copie o conteúdo de `supabase/migrations/202608130001_initial_schema.sql`, cole no SQL Editor e execute uma única vez.
4. Depois, faça o mesmo com `supabase/migrations/202608130002_checks.sql`.
5. Execute `supabase/migrations/202608140003_whatsapp_settings.sql`.
6. Execute `supabase/migrations/202608140004_profiles_and_documents.sql`.
7. Por último, execute `supabase/migrations/202608140005_bill_cnpj.sql`.
8. Se o banco já está funcionando, execute somente as migrações que ainda não foram aplicadas, sempre em ordem. Para esta atualização, basta executar a migração `005` uma vez.
9. Opcionalmente, execute `supabase/verify.sql`. Todas as tabelas listadas devem mostrar `row_security = true`.

O script cria:

- perfis de usuário;
- grupos empresariais;
- administradores, financeiros e aprovadores;
- empresas e filiais;
- boletos, encargos, protesto e aprovação;
- cheques pré-datados, datas de compensação e antecedência de alertas;
- histórico de lembretes;
- contato e modelo de mensagem do WhatsApp por grupo;
- nome e foto de perfil editáveis;
- armazenamento público das fotos de perfil no bucket `profile-avatars`;
- armazenamento privado dos PDFs no bucket `bill-documents`;
- CNPJ do beneficiário em cada boleto;
- notificações internas;
- políticas de Row Level Security (RLS).

## 2. Configurar a autenticação

No Supabase, abra **Authentication > URL Configuration** e informe:

- **Site URL de desenvolvimento:** `http://localhost:3000`
- Depois do primeiro deploy, substitua pela URL de produção da Vercel.
- Em **Redirect URLs**, adicione `http://localhost:3000/**` e `https://SEU-DOMINIO.vercel.app/**`.

Em **Authentication > Providers > Email**, mantenha Email habilitado. Se a confirmação de e-mail estiver ativa, o usuário precisará confirmar o cadastro antes do primeiro acesso.

## 3. Obter as variáveis públicas

No Supabase, abra **Project Settings > API Keys** e copie:

- Project URL;
- Publishable key.

Crie `.env.local` na raiz do projeto, usando `.env.example` como modelo:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUBSTITUA_AQUI
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Não use a `service_role` ou Secret key no navegador. Este projeto não precisa dela: as permissões são aplicadas pelo login e pelas políticas RLS.

## 4. Testar localmente

Requisitos: Node.js 22 ou superior.

```bash
npm ci
npm run dev:vercel
```

Abra `http://localhost:3000`, crie uma conta e informe o nome do grupo e da empresa matriz. O primeiro usuário se torna administrador.

Depois de entrar, abra **Configurações > WhatsApp**, informe o nome do responsável e o número com DDD e clique em **Salvar WhatsApp**. O código do Brasil (`+55`) é incluído automaticamente.

Em **Configurações**, teste também a alteração do nome, foto do perfil e nome do grupo. Em **Boletos**, escolha um PDF com texto selecionável para preencher fornecedor, CNPJ do beneficiário, valor, vencimento e código de barras automaticamente. PDFs digitalizados somente como imagem ainda precisam de preenchimento manual.

Antes do deploy, valide:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build:vercel
```

## 5. Fazer deploy pela Vercel

### Opção A — GitHub

1. Envie este projeto para um repositório GitHub.
2. Na Vercel, clique em **Add New > Project** e importe o repositório.
3. A Vercel detectará Next.js e usará o arquivo `vercel.json`.
4. Em **Settings > Environment Variables**, cadastre para Production, Preview e Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_APP_URL` (use a URL final da Vercel em Production)
5. Clique em **Deploy**.

### Opção B — Vercel CLI

```bash
npm install --global vercel
vercel
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
vercel env add NEXT_PUBLIC_APP_URL
vercel --prod
```

Depois do deploy, atualize a **Site URL** e as **Redirect URLs** no Supabase com o endereço final.

## 6. Regras importantes

- O administrador pode cadastrar boletos e cheques e preparar os lembretes do WhatsApp.
- Somente o administrador pode excluir boletos e cheques; o sistema pede confirmação antes da exclusão.
- Somente o administrador pode alterar o contato do WhatsApp do grupo.
- O financeiro pode cadastrar e atualizar boletos e cheques.
- O aprovador só poderá aprovar usando a função segura `approve_bill`; o banco permite somente um aprovador principal por grupo.
- Multa é armazenada em pontos-base: `200 = 2%`.
- Juros mensais são armazenados em pontos-base: `100 = 1% ao mês`.
- O valor com juros é uma estimativa. O valor oficial deve ser confirmado com o banco ou emissor.
- O valor de cada cheque é armazenado em centavos no banco, junto com número, banco, empresa, datas e observações.
- Administradores e financeiros podem editar cheques já cadastrados, inclusive substituir o valor completo.
- Na página de boletos, os registros são separados e ordenados pela data de vencimento.
- As datas dos cheques são calculadas em dias corridos. O WhatsApp só é aberto após uma ação do administrador e a mensagem precisa ser confirmada manualmente.
- Os PDFs dos boletos ficam em um bucket privado e são abertos com uma URL temporária de cinco minutos.
- A exportação em Excel inclui um resumo e uma aba com os boletos ordenados por vencimento, contendo CNPJ do beneficiário, valores, datas, encargos, protesto, centro de custo, aprovação e demais campos cadastrados.
- A integração bancária continua fora desta etapa.
