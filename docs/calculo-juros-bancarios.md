# Cálculo estimado de juros bancários

O sistema permite registrar, em cada boleto, uma multa percentual única e uma
taxa de juros simples ao mês. Quando o boleto está vencido, o valor atualizado é
estimado proporcionalmente por dia, usando um mês convencional de 30 dias.

## Fórmula

```text
dias em atraso = máximo(0, data do cálculo - data de vencimento)
multa = valor original × multa percentual
juros = valor original × juros mensal × dias em atraso ÷ 30
valor atualizado = valor original + multa + juros
```

Todos os valores monetários são calculados em centavos inteiros. O arredondamento
ocorre apenas ao final de cada componente.

## Limites e segurança

- A multa e os juros não são aplicados antes ou no dia do vencimento.
- Percentuais aceitos: de 0% a 100%.
- O sistema usa juros simples, sem capitalização.
- A estimativa não substitui a atualização oficial do banco ou do emissor.
- Antes de pagar, o usuário deve conferir o valor no boleto ou no canal oficial.
- Alterações de taxa devem entrar no histórico de auditoria quando a persistência
  definitiva for conectada.

## Campos previstos no banco

```text
original_amount_cents bigint not null
late_fee_basis_points integer not null default 0
monthly_interest_basis_points integer not null default 0
interest_calculation_method text not null default 'simple_30_day_month'
```

Um percentual de 2% é armazenado como 200 pontos-base e 1% como 100 pontos-base.
O valor atualizado é calculado sob demanda; não deve ser gravado como fonte de
verdade, pois muda diariamente.
