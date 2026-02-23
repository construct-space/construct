package svc

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"construct-context/providers"
	"construct-context/skills"
)

const skillsRuntimeEnabledSettingKey = "skills.runtime.enabled"

// IsSkillRuntimeEnabled returns true if the skill runtime is enabled.
func (s *Service) IsSkillRuntimeEnabled() bool {
	if s.Storage == nil {
		return true
	}
	value, err := s.Storage.GetSetting(skillsRuntimeEnabledSettingKey)
	if err != nil {
		return true
	}
	return ParseBoolSetting(value, true)
}

func isIgnorableSkillLoadError(err error) bool {
	if err == nil {
		return true
	}
	msg := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(msg, "already registered")
}

// LoadBuiltinsIdempotent loads all builtin skills, ignoring "already registered" errors.
func LoadBuiltinsIdempotent(ctx context.Context) error {
	errs := skills.LoadBuiltins(ctx)
	if len(errs) == 0 {
		return nil
	}
	nonIgnorable := make([]string, 0, len(errs))
	for _, err := range errs {
		if isIgnorableSkillLoadError(err) {
			continue
		}
		nonIgnorable = append(nonIgnorable, err.Error())
	}
	if len(nonIgnorable) == 0 {
		return nil
	}
	return fmt.Errorf("failed to load some skills: %s", strings.Join(nonIgnorable, "; "))
}

func (s *Service) skillRuntimeStateScope() (key string, userID *string, companyID *int, ok bool) {
	if s.Storage == nil {
		return "", nil, nil, false
	}

	currentUserID := s.Storage.GetCurrentUserID()
	currentCompanyID := s.Storage.GetCurrentCompanyID()

	key = fmt.Sprintf("skills:runtime:enabled:company:%d:user:%d", currentCompanyID, currentUserID)

	if currentUserID > 0 {
		userIDStr := strconv.FormatUint(uint64(currentUserID), 10)
		userID = &userIDStr
	}
	if currentCompanyID > 0 {
		companyIDValue := currentCompanyID
		companyID = &companyIDValue
	}

	return key, userID, companyID, true
}

// PersistActiveSkillState saves the list of currently active skills.
func (s *Service) PersistActiveSkillState() error {
	key, userID, companyID, ok := s.skillRuntimeStateScope()
	if !ok {
		return nil
	}

	active := skills.DefaultRegistry.ListActive()
	enabledIDs := make([]string, 0, len(active))
	for _, info := range active {
		enabledIDs = append(enabledIDs, info.ID)
	}
	sort.Strings(enabledIDs)

	payload, err := json.Marshal(enabledIDs)
	if err != nil {
		return err
	}

	return s.Storage.KVSet(key, string(payload), "skills", userID, companyID)
}

func (s *Service) loadPersistedSkillState() ([]string, bool, error) {
	key, _, _, ok := s.skillRuntimeStateScope()
	if !ok {
		return nil, false, nil
	}

	entry, err := s.Storage.KVGet(key)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, err
	}
	if entry == nil {
		return nil, false, nil
	}

	raw := strings.TrimSpace(entry.Value)
	if raw == "" {
		return []string{}, true, nil
	}

	var enabledIDs []string
	if err := json.Unmarshal([]byte(raw), &enabledIDs); err != nil {
		return nil, true, err
	}
	return enabledIDs, true, nil
}

// RestorePersistedSkillState restores skill state from storage.
func (s *Service) RestorePersistedSkillState(ctx context.Context) error {
	enabledIDs, found, err := s.loadPersistedSkillState()
	if err != nil {
		return err
	}

	if !found {
		// First run/profile: persist current defaults as the baseline.
		return s.PersistActiveSkillState()
	}

	target := make(map[string]struct{}, len(enabledIDs))
	for _, id := range enabledIDs {
		if id = strings.TrimSpace(id); id != "" {
			target[id] = struct{}{}
		}
	}

	allInfo := skills.DefaultRegistry.GetAllInfo()
	infoByID := make(map[string]*skills.SkillInfo, len(allInfo))
	for _, info := range allInfo {
		infoByID[info.ID] = info
	}

	var errMessages []string

	// Ensure desired skills are loaded and enabled.
	for id := range target {
		info, exists := infoByID[id]
		if !exists {
			errMessages = append(errMessages, fmt.Sprintf("unknown skill '%s' in persisted state", id))
			continue
		}

		if info.State == skills.SkillStateUnloaded || info.State == skills.SkillStateError {
			config := &skills.SkillConfig{
				Enabled:     true,
				Permissions: skills.DefaultPermissions(),
			}
			if loadErr := skills.DefaultLoader.LoadSkill(ctx, id, config); loadErr != nil {
				errMessages = append(errMessages, fmt.Sprintf("load %s: %v", id, loadErr))
				continue
			}
			info, _ = skills.DefaultRegistry.GetInfo(id)
		}

		if info != nil && info.State == skills.SkillStateDisabled {
			if enableErr := skills.DefaultRegistry.Enable(ctx, id); enableErr != nil {
				errMessages = append(errMessages, fmt.Sprintf("enable %s: %v", id, enableErr))
			}
		}
	}

	// Disable any currently active skills not in the persisted allow-list.
	for _, info := range skills.DefaultRegistry.GetAllInfo() {
		if info.State != skills.SkillStateActive {
			continue
		}
		if _, keep := target[info.ID]; keep {
			continue
		}
		if disableErr := skills.DefaultRegistry.Disable(ctx, info.ID); disableErr != nil {
			errMessages = append(errMessages, fmt.Sprintf("disable %s: %v", info.ID, disableErr))
		}
	}

	if persistErr := s.PersistActiveSkillState(); persistErr != nil {
		errMessages = append(errMessages, fmt.Sprintf("persist active skills: %v", persistErr))
	}

	if len(errMessages) > 0 {
		return fmt.Errorf(strings.Join(errMessages, "; "))
	}
	return nil
}

// InitializeSkillRuntime loads builtins and restores persisted skill state.
func (s *Service) InitializeSkillRuntime(ctx context.Context) error {
	if err := LoadBuiltinsIdempotent(ctx); err != nil {
		return err
	}
	return s.RestorePersistedSkillState(ctx)
}

// DefaultCompositeModelID returns the default composite model ID (provider:model).
func (s *Service) DefaultCompositeModelID() string {
	defaultProviderID := strings.TrimSpace(s.Providers.DefaultKey())
	if defaultProviderID == "" {
		return ""
	}
	defaultProvider, ok := s.Providers.Get(defaultProviderID)
	if !ok || defaultProvider == nil {
		return ""
	}
	defaultModels := defaultProvider.Models()
	if len(defaultModels) == 0 {
		return ""
	}
	return defaultProviderID + ":" + defaultModels[0]
}

func (s *Service) isKnownRegistryModel(model string) bool {
	requested := strings.TrimSpace(model)
	if requested == "" {
		return false
	}
	for _, modelID := range s.Providers.AllModelIDs() {
		if modelID == requested || providers.ExtractModelName(modelID) == requested {
			return true
		}
	}
	return false
}

// NormalizeModelSelection falls back to the default model if the requested model is unknown.
func (s *Service) NormalizeModelSelection(model string) (string, bool) {
	requested := strings.TrimSpace(model)
	if requested == "" || providers.IsAutoModel(requested) {
		return requested, false
	}

	// OAuth providers and aliases are resolved in specialized branches.
	if strings.HasPrefix(requested, "anthropic-oauth:") ||
		strings.HasPrefix(requested, "openai-oauth:") ||
		strings.HasPrefix(requested, "claude-") ||
		providers.ExtractModelName(requested) == OpenAIOAuthModelID {
		return requested, false
	}

	if s.isKnownRegistryModel(requested) {
		return requested, false
	}

	fallback := s.DefaultCompositeModelID()
	if fallback == "" || fallback == requested {
		return requested, false
	}
	return fallback, true
}
