package handlers

import (
	"archive/tar"
	"compress/gzip"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"construct-context/svc"
)

// SpaceManifest is the manifest format stored in each space tarball
type SpaceManifest struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Version     string `json:"version"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Scope       string `json:"scope"`
	Navigation  any    `json:"navigation,omitempty"`
	Pages       any    `json:"pages,omitempty"`
	Toolbar     any    `json:"toolbar,omitempty"`
	Theme       any    `json:"theme,omitempty"`
}

// InstalledSpace is stored in the KV store
type InstalledSpace struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
	Version     string `json:"version"`
	Enabled     bool   `json:"enabled"`
	InstalledAt string `json:"installed_at"`
	HasUpdate   bool   `json:"has_update"`
	Icon        string `json:"icon,omitempty"`
}

const spacesKVKey = "spaces.installed"

func getSpacesDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".construct", "spaces")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}

func getInstalledSpaces(s *svc.Service) ([]InstalledSpace, error) {
	if s.Storage == nil {
		return []InstalledSpace{}, nil
	}
	entry, err := s.Storage.KVGet(spacesKVKey)
	if err != nil || entry == nil {
		return []InstalledSpace{}, nil
	}
	var spaces []InstalledSpace
	if err := json.Unmarshal([]byte(entry.Value), &spaces); err != nil {
		return []InstalledSpace{}, nil
	}
	return spaces, nil
}

func saveInstalledSpaces(s *svc.Service, spaces []InstalledSpace) error {
	if s.Storage == nil {
		return fmt.Errorf("storage not available")
	}
	data, err := json.Marshal(spaces)
	if err != nil {
		return err
	}
	return s.Storage.KVSet(spacesKVKey, string(data), "spaces", nil, nil)
}

// fetchRegistryIndex fetches the space-releases index from GitHub
func fetchRegistryIndex() (map[string]any, error) {
	url := "https://raw.githubusercontent.com/construct-base/space-releases/main/index.json"
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("registry returned %d", resp.StatusCode)
	}
	var idx map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&idx); err != nil {
		return nil, err
	}
	return idx, nil
}

// downloadAndExtractSpace downloads a space tarball and extracts it
func downloadAndExtractSpace(spaceID, version string) (*SpaceManifest, error) {
	spacesDir, err := getSpacesDir()
	if err != nil {
		return nil, err
	}

	// Fetch the index to find the tarball URL
	idx, err := fetchRegistryIndex()
	if err != nil {
		return nil, fmt.Errorf("failed to fetch registry: %w", err)
	}

	spacesRaw, ok := idx["spaces"].([]any)
	if !ok {
		return nil, fmt.Errorf("invalid registry format")
	}

	// Find the space in the registry
	var tarballPath string
	var spaceVersion string
	for _, s := range spacesRaw {
		sm, ok := s.(map[string]any)
		if !ok {
			continue
		}
		if sm["id"] == spaceID {
			tarballPath, _ = sm["tarball"].(string)
			spaceVersion, _ = sm["version"].(string)
			break
		}
	}
	if tarballPath == "" {
		return nil, fmt.Errorf("space %q not found in registry", spaceID)
	}
	if version == "" {
		version = spaceVersion
	}

	// Download tarball from GitHub raw
	tarballURL := fmt.Sprintf("https://raw.githubusercontent.com/construct-base/space-releases/main/%s", tarballPath)
	fmt.Fprintf(os.Stderr, "[spaces] Downloading %s from %s\n", spaceID, tarballURL)

	resp, err := http.Get(tarballURL)
	if err != nil {
		return nil, fmt.Errorf("failed to download tarball: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("tarball download returned %d", resp.StatusCode)
	}

	// Extract to ~/.construct/spaces/{id}/
	spaceDir := filepath.Join(spacesDir, spaceID)
	if err := os.MkdirAll(spaceDir, 0755); err != nil {
		return nil, err
	}

	gz, err := gzip.NewReader(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to decompress: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	var manifest *SpaceManifest

	for {
		header, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("tar read error: %w", err)
		}

		// Clean up the path (strip leading ./)
		name := strings.TrimPrefix(header.Name, "./")
		if name == "" || name == "." {
			continue
		}

		target := filepath.Join(spaceDir, name)

		// Security: prevent path traversal
		if !strings.HasPrefix(target, spaceDir) {
			continue
		}

		switch header.Typeflag {
		case tar.TypeDir:
			os.MkdirAll(target, 0755)
		case tar.TypeReg:
			os.MkdirAll(filepath.Dir(target), 0755)
			f, err := os.Create(target)
			if err != nil {
				continue
			}
			io.Copy(f, tr)
			f.Close()

			// Parse space.manifest.json if found
			if name == "space.manifest.json" {
				data, _ := os.ReadFile(target)
				var m SpaceManifest
				if json.Unmarshal(data, &m) == nil {
					manifest = &m
				}
			}
		}
	}

	// Create manifest.json (the format SpaceLoader expects) from space.manifest.json
	if manifest != nil {
		manifestData, _ := json.MarshalIndent(manifest, "", "  ")
		os.WriteFile(filepath.Join(spaceDir, "manifest.json"), manifestData, 0644)
		fmt.Fprintf(os.Stderr, "[spaces] Extracted %s v%s to %s\n", spaceID, manifest.Version, spaceDir)
	}

	return manifest, nil
}

// HandleSpaces handles spaces.* requests
func HandleSpaces(s *svc.Service, req svc.Request) svc.Response {
	switch req.Type {
	case "spaces.list_installed":
		spaces, err := getInstalledSpaces(s)
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"spaces": spaces}}

	case "spaces.list_remote":
		idx, err := fetchRegistryIndex()
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}
		return svc.Response{ID: req.ID, Success: true, Data: idx}

	case "spaces.install":
		var payload struct {
			ID          string `json:"id"`
			RegistryURL string `json:"registryUrl,omitempty"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: "invalid payload: " + err.Error()}
		}
		if payload.ID == "" {
			return svc.Response{ID: req.ID, Success: false, Error: "space id is required"}
		}

		// Check if already installed
		spaces, _ := getInstalledSpaces(s)
		for _, sp := range spaces {
			if sp.ID == payload.ID {
				return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
					"message": "already installed",
					"space":   sp,
				}}
			}
		}

		// Download and extract
		manifest, err := downloadAndExtractSpace(payload.ID, "")
		if err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: "install failed: " + err.Error()}
		}

		displayName := payload.ID
		version := "0.0.0"
		icon := "i-lucide-box"
		if manifest != nil {
			displayName = manifest.Name
			version = manifest.Version
			icon = manifest.Icon
		}

		// Add to installed list
		installed := InstalledSpace{
			ID:          payload.ID,
			Name:        payload.ID,
			DisplayName: displayName,
			Version:     version,
			Enabled:     true,
			InstalledAt: time.Now().UTC().Format(time.RFC3339),
			HasUpdate:   false,
			Icon:        icon,
		}
		spaces = append(spaces, installed)
		if err := saveInstalledSpaces(s, spaces); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: "failed to save: " + err.Error()}
		}

		fmt.Fprintf(os.Stderr, "[spaces] Installed %s v%s\n", payload.ID, version)
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{
			"message": "installed",
			"space":   installed,
		}}

	case "spaces.uninstall":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		spaces, _ := getInstalledSpaces(s)
		filtered := make([]InstalledSpace, 0, len(spaces))
		for _, sp := range spaces {
			if sp.ID != payload.ID {
				filtered = append(filtered, sp)
			}
		}

		if err := saveInstalledSpaces(s, filtered); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		// Remove space directory
		spacesDir, _ := getSpacesDir()
		if spacesDir != "" {
			os.RemoveAll(filepath.Join(spacesDir, payload.ID))
		}

		return svc.Response{ID: req.ID, Success: true}

	case "spaces.enable":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		spaces, _ := getInstalledSpaces(s)
		for i, sp := range spaces {
			if sp.ID == payload.ID {
				spaces[i].Enabled = true
				break
			}
		}
		saveInstalledSpaces(s, spaces)
		return svc.Response{ID: req.ID, Success: true}

	case "spaces.disable":
		var payload struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			return svc.Response{ID: req.ID, Success: false, Error: err.Error()}
		}

		spaces, _ := getInstalledSpaces(s)
		for i, sp := range spaces {
			if sp.ID == payload.ID {
				spaces[i].Enabled = false
				break
			}
		}
		saveInstalledSpaces(s, spaces)
		return svc.Response{ID: req.ID, Success: true}

	case "spaces.check_updates":
		// Fetch registry and compare versions
		idx, err := fetchRegistryIndex()
		if err != nil {
			return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"updates": 0}}
		}

		spacesRaw, _ := idx["spaces"].([]any)
		remoteVersions := make(map[string]string)
		for _, s := range spacesRaw {
			sm, ok := s.(map[string]any)
			if !ok {
				continue
			}
			id, _ := sm["id"].(string)
			ver, _ := sm["version"].(string)
			remoteVersions[id] = ver
		}

		installed, _ := getInstalledSpaces(s)
		updates := 0
		for i, sp := range installed {
			if rv, ok := remoteVersions[sp.ID]; ok && rv != sp.Version {
				installed[i].HasUpdate = true
				installed[i].HasUpdate = true
				updates++
			}
		}
		if updates > 0 {
			saveInstalledSpaces(s, installed)
		}
		return svc.Response{ID: req.ID, Success: true, Data: map[string]any{"updates": updates}}

	default:
		return svc.Response{ID: req.ID, Success: false, Error: "unknown spaces request: " + req.Type}
	}
}
