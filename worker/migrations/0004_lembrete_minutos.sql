-- Lembrete deixou de ser só em dias, agora é configurável em minutos
-- (permite presets como "15 min antes", "1 hora antes", "1 dia antes"...).
ALTER TABLE items ADD COLUMN lembrete_offset_minutos INTEGER NOT NULL DEFAULT 0;
UPDATE items SET lembrete_offset_minutos = lembrete_offset_dias * 1440 WHERE lembrete_offset_dias > 0;
