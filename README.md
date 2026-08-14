# Gestão de Pagamentos

SaaS multiempresa para organizar boletos e cheques, calcular vencimentos,
compensações, multa e juros, controlar prazos para protesto e preparar
lembretes pelo WhatsApp. O sistema também lê fornecedor, CNPJ, valor, vencimento
e código de barras dos boletos em PDF, armazena
os documentos com acesso protegido e exporta os boletos para Excel.

## Tecnologias

- Next.js 16, React 19 e TypeScript;
- Supabase Auth e Postgres com Row Level Security;
- Supabase Storage para fotos de perfil e PDFs dos boletos;
- PDF.js para leitura de PDFs e SheetJS para relatórios `.xlsx`;
- Vercel para produção;
- Vinext para a prévia do ambiente de desenvolvimento.

## Começar

Consulte [DEPLOY_SUPABASE_VERCEL.md](./DEPLOY_SUPABASE_VERCEL.md) para criar o
banco, configurar as chaves públicas e publicar o sistema.

Depois de configurar o arquivo `.env.local`:

```bash
npm ci
npm run dev:vercel
```

Abra `http://localhost:3000`.

## Validação

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build:vercel
```

O contato do WhatsApp é salvo nas configurações do grupo. Somente o
administrador pode alterá-lo ou preparar lembretes. O sistema abre o WhatsApp
com a mensagem pronta, mas o envio continua dependendo da confirmação manual.

Em **Configurações**, cada usuário pode alterar o próprio nome e foto. O
administrador também pode alterar o nome do grupo. Em **Relatórios**, o botão
**Exportar Excel** gera uma planilha com todos os campos dos boletos ordenados
pela data de vencimento, incluindo o CNPJ do beneficiário. Valores de boletos e
cheques podem ser digitados diretamente no formato brasileiro, como `1.250,75`.
Os boletos aparecem agrupados pela data de vencimento. Administradores e usuários
do financeiro podem editar todos os dados dos cheques já cadastrados, inclusive o
valor; o administrador pode excluir registros após confirmar a ação. A tipografia
da interface foi ampliada para facilitar a leitura.
