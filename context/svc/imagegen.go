package svc

import (
	"bytes"
	ctxproviders "construct-context/providers"
	"construct-context/tools"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ImageGenProvider represents an image generation provider
type ImageGenProvider struct {
	ID      string  // Provider identifier
	Name    string  // Display name
	Model   string  // Model name for API
	BaseURL string  // API base URL
	APIKey  string  // API key
	Cost    float64 // Approximate cost per image in USD
}

// ImageGenRouter manages multiple image generation providers
type ImageGenRouter struct {
	providers []*ImageGenProvider // Sorted by cost (cheapest first)
	client    *http.Client
}

// NewImageGenRouter creates a router with configured providers
func NewImageGenRouter() *ImageGenRouter {
	return &ImageGenRouter{
		providers: make([]*ImageGenProvider, 0),
		client:    ctxproviders.NewHTTPClient(120 * time.Second),
	}
}

// AddProvider adds an image generation provider
func (r *ImageGenRouter) AddProvider(p *ImageGenProvider) {
	// Insert sorted by cost (cheapest first)
	inserted := false
	for i, existing := range r.providers {
		if p.Cost < existing.Cost {
			r.providers = append(r.providers[:i+1], r.providers[i:]...)
			r.providers[i] = p
			inserted = true
			break
		}
	}
	if !inserted {
		r.providers = append(r.providers, p)
	}
}

// Generate generates an image, routing to the cheapest available provider
// If provider is specified, uses that provider directly
func (r *ImageGenRouter) Generate(prompt, size, quality, preferredProvider string) (*tools.ImageGenResult, error) {
	if len(r.providers) == 0 {
		return nil, fmt.Errorf("no image generation providers configured")
	}

	// If preferred provider specified, try it first
	if preferredProvider != "" {
		for _, p := range r.providers {
			if p.ID == preferredProvider {
				result, err := r.generateWith(p, prompt, size, quality)
				if err == nil {
					return result, nil
				}
				// Fall through to try others
				break
			}
		}
	}

	// Try providers in cost order (cheapest first)
	var lastErr error
	for _, p := range r.providers {
		result, err := r.generateWith(p, prompt, size, quality)
		if err == nil {
			return result, nil
		}
		lastErr = err
	}

	return nil, fmt.Errorf("all image generation providers failed, last error: %v", lastErr)
}

// ListProviders returns available image gen providers
func (r *ImageGenRouter) ListProviders() []map[string]any {
	result := make([]map[string]any, 0, len(r.providers))
	for _, p := range r.providers {
		result = append(result, map[string]any{
			"id":    p.ID,
			"name":  p.Name,
			"model": p.Model,
			"cost":  p.Cost,
		})
	}
	return result
}

func (r *ImageGenRouter) generateWith(p *ImageGenProvider, prompt, size, quality string) (*tools.ImageGenResult, error) {
	switch p.ID {
	case "zai":
		return r.generateZAI(p, prompt, size, quality)
	case "xai":
		return r.generateXAI(p, prompt, size)
	default:
		return nil, fmt.Errorf("unknown image gen provider: %s", p.ID)
	}
}

// Z.ai CogView-4 image generation
func (r *ImageGenRouter) generateZAI(p *ImageGenProvider, prompt, size, quality string) (*tools.ImageGenResult, error) {
	if size == "" {
		size = "1024x1024"
	}
	if quality == "" {
		quality = "standard"
	}

	reqBody := map[string]any{
		"model":   p.Model,
		"prompt":  prompt,
		"size":    size,
		"quality": quality,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("Z.ai request marshal error: %v", err)
	}
	req, err := http.NewRequest("POST", p.BaseURL+"/images/generations", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)
	req.Header.Set("Accept-Language", "en-US,en")

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Z.ai image gen error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			return nil, fmt.Errorf("Z.ai image gen error: %d (failed to read response: %v)", resp.StatusCode, readErr)
		}
		return nil, fmt.Errorf("Z.ai image gen error: %d - %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if len(result.Data) == 0 || result.Data[0].URL == "" {
		return nil, fmt.Errorf("Z.ai returned no image URL")
	}

	return &tools.ImageGenResult{
		Provider: "zai",
		Model:    p.Model,
		URL:      result.Data[0].URL,
	}, nil
}

// xAI Grok Imagine image generation
func (r *ImageGenRouter) generateXAI(p *ImageGenProvider, prompt, size string) (*tools.ImageGenResult, error) {
	if size == "" {
		size = "1024x1024"
	}

	// Parse size to width/height for xAI format
	reqBody := map[string]any{
		"model":           p.Model,
		"prompt":          prompt,
		"size":            size,
		"response_format": "url",
		"n":               1,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("xAI request marshal error: %v", err)
	}
	req, err := http.NewRequest("POST", p.BaseURL+"/images/generations", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("xAI image gen error: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, readErr := io.ReadAll(resp.Body)
		if readErr != nil {
			return nil, fmt.Errorf("xAI image gen error: %d (failed to read response: %v)", resp.StatusCode, readErr)
		}
		return nil, fmt.Errorf("xAI image gen error: %d - %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Data []struct {
			URL     string `json:"url"`
			B64JSON string `json:"b64_json"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if len(result.Data) == 0 {
		return nil, fmt.Errorf("xAI returned no image data")
	}

	return &tools.ImageGenResult{
		Provider: "xai",
		Model:    p.Model,
		URL:      result.Data[0].URL,
		B64JSON:  result.Data[0].B64JSON,
	}, nil
}
