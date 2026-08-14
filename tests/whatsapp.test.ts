import assert from "node:assert/strict";
import test from "node:test";
import {
  formatWhatsAppPhone,
  isValidWhatsAppPhone,
  normalizeWhatsAppPhone,
  renderReminderTemplate,
} from "../lib/whatsapp.ts";

test("normaliza telefone brasileiro com DDD para o formato do WhatsApp", () => {
  assert.equal(normalizeWhatsAppPhone("(81) 9 8765-4321"), "5581987654321");
  assert.equal(normalizeWhatsAppPhone("+55 81 98765-4321"), "5581987654321");
});

test("valida números brasileiros com DDD", () => {
  assert.equal(isValidWhatsAppPhone("81 98765-4321"), true);
  assert.equal(isValidWhatsAppPhone("98765-4321"), false);
});

test("formata o telefone para exibição", () => {
  assert.equal(formatWhatsAppPhone("5581987654321"), "(81) 98765-4321");
});

test("substitui os campos da mensagem padrão", () => {
  assert.equal(
    renderReminderTemplate("Olá, {nome}. Pague {fornecedor}: {valor}, até {vencimento}.", {
      nome: "João",
      fornecedor: "Energia",
      valor: "R$ 100,00",
      vencimento: "20 de agosto de 2026",
    }),
    "Olá, João. Pague Energia: R$ 100,00, até 20 de agosto de 2026.",
  );
});
