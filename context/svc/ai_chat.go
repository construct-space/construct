package svc

import (
	"fmt"
	"os"
	"strings"
	"time"

	"construct-context/providers"
)

// SharedShortHTTPClient is a package-level shared HTTP client for short-timeout requests (e.g. Codestral FIM).
var SharedShortHTTPClient = providers.NewHTTPClient(5 * time.Second)

// CallAI calls the appropriate AI provider's chat API
func (s *Service) CallAI(systemPrompt string, messages []providers.ChatMessage, model string) (string, error) {
	var provider providers.Provider

	if normalizedModel, changed := s.NormalizeModelSelection(model); changed {
		fmt.Fprintf(os.Stderr, "[model] callAI fallback: '%s' -> '%s'\n", model, normalizedModel)
		model = normalizedModel
	}

	// If caller explicitly selected a provider (provider:model), do not silently
	// fall back to another provider. Return a clear error instead.
	if parts := strings.SplitN(model, ":", 2); len(parts) == 2 {
		providerKey := strings.TrimSpace(parts[0])
		modelName := strings.TrimSpace(parts[1])
		if providerKey != "" && !providers.IsAutoModel(providerKey) && providerKey != "anthropic-oauth" && providerKey != "openai-oauth" {
			explicitProvider, ok := s.Providers.Get(providerKey)
			if !ok || explicitProvider == nil {
				return "", fmt.Errorf("Provider '%s' is not available. Reconnect it in Settings > AI", providerKey)
			}
			if modelName != "" {
				found := false
				for _, m := range explicitProvider.Models() {
					if m == modelName {
						found = true
						break
					}
				}
				if !found {
					return "", fmt.Errorf("Model '%s' is not available for provider '%s'", modelName, providerKey)
				}
			}
		}
	}

	if strings.HasPrefix(model, "anthropic-oauth:") || strings.HasPrefix(model, "claude-") {
		anthropicProvider, err := s.GetAnthropicOAuthProvider()
		if err != nil {
			return "", err
		}
		provider = anthropicProvider
	}

	if strings.HasPrefix(model, "openai-oauth:") || providers.ExtractModelName(model) == OpenAIOAuthModelID {
		openAIProvider, err := s.GetOpenAIOAuthProvider()
		if err != nil {
			return "", err
		}
		provider = openAIProvider
	}

	if provider == nil {
		provider, _ = s.Providers.GetProviderForModel(model)
	}
	if provider == nil {
		return "", fmt.Errorf("no provider found for model: %s", model)
	}

	// Prepend system message
	allMessages := []providers.ChatMessage{{Role: "system", Content: systemPrompt}}
	allMessages = append(allMessages, messages...)

	// Extract just the model name (handle composite IDs like "deepseek:deepseek-chat")
	modelName := providers.ExtractModelName(model)
	return provider.Chat(allMessages, modelName)
}
