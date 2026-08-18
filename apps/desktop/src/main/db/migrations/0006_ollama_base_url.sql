-- Phase 9: Ollama remote mode support
-- Adds optional base_url column to ai_provider_config for remote/custom Ollama endpoints

ALTER TABLE ai_provider_config ADD COLUMN base_url TEXT;
