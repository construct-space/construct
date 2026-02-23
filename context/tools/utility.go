package tools

import (
	"construct-context/providers"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// UtilityTools - General utility tools for common operations
func init() {
	category := &ToolCategory{
		Name:        "utility",
		Description: "General utility tools for calculations, conversions, and data manipulation",
		Tools: []providers.Tool{
			// Time/Date tools
			MakeTool("get_current_time", "Get the current date and time",
				map[string]providers.Property{
					"timezone": {Type: "string", Description: "Timezone (e.g., 'America/New_York', 'UTC', 'Europe/London')"},
					"format":   {Type: "string", Description: "Date format: iso, unix, human, custom", Enum: []string{"iso", "unix", "human", "custom"}},
				}, nil),

			MakeTool("convert_timezone", "Convert a time between timezones",
				map[string]providers.Property{
					"time":          {Type: "string", Description: "The time to convert (ISO 8601 format)"},
					"from_timezone": {Type: "string", Description: "Source timezone"},
					"to_timezone":   {Type: "string", Description: "Target timezone"},
				}, []string{"time", "from_timezone", "to_timezone"}),

			MakeTool("calculate_time_difference", "Calculate the difference between two dates/times",
				map[string]providers.Property{
					"start": {Type: "string", Description: "Start date/time (ISO 8601)"},
					"end":   {Type: "string", Description: "End date/time (ISO 8601)"},
					"unit":  {Type: "string", Description: "Output unit: seconds, minutes, hours, days, weeks", Enum: []string{"seconds", "minutes", "hours", "days", "weeks"}},
				}, []string{"start", "end"}),

			// Math tools
			MakeTool("calculate", "Perform mathematical calculations",
				map[string]providers.Property{
					"expression": {Type: "string", Description: "Mathematical expression to evaluate (e.g., '2 + 2', 'sqrt(16)', 'sin(45)')"},
				}, []string{"expression"}),

			MakeTool("convert_units", "Convert between units of measurement",
				map[string]providers.Property{
					"value":     {Type: "number", Description: "The value to convert"},
					"from_unit": {Type: "string", Description: "Source unit (e.g., 'km', 'miles', 'kg', 'lbs', 'celsius', 'fahrenheit')"},
					"to_unit":   {Type: "string", Description: "Target unit"},
				}, []string{"value", "from_unit", "to_unit"}),

			MakeTool("calculate_percentage", "Calculate percentages",
				map[string]providers.Property{
					"operation": {Type: "string", Description: "Operation: of (X% of Y), change (% change from X to Y), is (X is what % of Y)", Enum: []string{"of", "change", "is"}},
					"value1":    {Type: "number", Description: "First value"},
					"value2":    {Type: "number", Description: "Second value"},
				}, []string{"operation", "value1", "value2"}),

			// String tools
			MakeTool("format_text", "Format or transform text",
				map[string]providers.Property{
					"text":      {Type: "string", Description: "The text to format"},
					"operation": {Type: "string", Description: "Operation: uppercase, lowercase, title_case, reverse, trim, slug, camel_case, snake_case", Enum: []string{"uppercase", "lowercase", "title_case", "reverse", "trim", "slug", "camel_case", "snake_case"}},
				}, []string{"text", "operation"}),

			MakeTool("count_text", "Count characters, words, or lines in text",
				map[string]providers.Property{
					"text": {Type: "string", Description: "The text to count"},
					"type": {Type: "string", Description: "What to count: characters, words, lines, sentences", Enum: []string{"characters", "words", "lines", "sentences"}},
				}, []string{"text"}),

			MakeTool("extract_from_text", "Extract patterns from text using regex",
				map[string]providers.Property{
					"text":    {Type: "string", Description: "The text to search"},
					"pattern": {Type: "string", Description: "Regex pattern or preset: email, url, phone, number"},
				}, []string{"text", "pattern"}),

			// ID/Random generation
			MakeTool("generate_uuid", "Generate a UUID (Universally Unique Identifier)",
				map[string]providers.Property{
					"version": {Type: "string", Description: "UUID version: v4 (random), v7 (time-ordered)", Enum: []string{"v4", "v7"}},
					"count":   {Type: "number", Description: "Number of UUIDs to generate (default 1)"},
				}, nil),

			MakeTool("generate_random", "Generate random values",
				map[string]providers.Property{
					"type":   {Type: "string", Description: "Type: number, string, hex, base64", Enum: []string{"number", "string", "hex", "base64"}},
					"length": {Type: "number", Description: "Length for strings, or max value for numbers"},
					"min":    {Type: "number", Description: "Minimum value for numbers (default 0)"},
				}, []string{"type"}),

			// Encoding
			MakeTool("encode_decode", "Encode or decode data",
				map[string]providers.Property{
					"data":      {Type: "string", Description: "The data to encode/decode"},
					"format":    {Type: "string", Description: "Format: base64, hex, url", Enum: []string{"base64", "hex", "url"}},
					"operation": {Type: "string", Description: "Operation: encode, decode", Enum: []string{"encode", "decode"}},
				}, []string{"data", "format", "operation"}),

			// JSON tools
			MakeTool("format_json", "Format, minify, or validate JSON",
				map[string]providers.Property{
					"json":      {Type: "string", Description: "The JSON string"},
					"operation": {Type: "string", Description: "Operation: format (pretty print), minify, validate", Enum: []string{"format", "minify", "validate"}},
				}, []string{"json", "operation"}),

			MakeTool("json_path", "Extract values from JSON using path",
				map[string]providers.Property{
					"json": {Type: "string", Description: "The JSON string"},
					"path": {Type: "string", Description: "JSON path (e.g., 'data.users[0].name')"},
				}, []string{"json", "path"}),

			// Hash tools
			MakeTool("hash_text", "Generate hash of text",
				map[string]providers.Property{
					"text":      {Type: "string", Description: "The text to hash"},
					"algorithm": {Type: "string", Description: "Hash algorithm: md5, sha1, sha256, sha512", Enum: []string{"md5", "sha1", "sha256", "sha512"}},
				}, []string{"text", "algorithm"}),

			// Color tools
			MakeTool("convert_color", "Convert between color formats",
				map[string]providers.Property{
					"color":     {Type: "string", Description: "Color value (e.g., '#FF0000', 'rgb(255,0,0)', 'hsl(0,100%,50%)')"},
					"to_format": {Type: "string", Description: "Target format: hex, rgb, hsl", Enum: []string{"hex", "rgb", "hsl"}},
				}, []string{"color", "to_format"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	// Register executors
	DefaultRegistry.RegisterExecutor("get_current_time", executeGetCurrentTime)
	DefaultRegistry.RegisterExecutor("convert_timezone", executeConvertTimezone)
	DefaultRegistry.RegisterExecutor("calculate_time_difference", executeCalculateTimeDifference)
	DefaultRegistry.RegisterExecutor("calculate", executeCalculate)
	DefaultRegistry.RegisterExecutor("convert_units", executeConvertUnits)
	DefaultRegistry.RegisterExecutor("calculate_percentage", executeCalculatePercentage)
	DefaultRegistry.RegisterExecutor("format_text", executeFormatText)
	DefaultRegistry.RegisterExecutor("count_text", executeCountText)
	DefaultRegistry.RegisterExecutor("extract_from_text", executeExtractFromText)
	DefaultRegistry.RegisterExecutor("generate_uuid", executeGenerateUUID)
	DefaultRegistry.RegisterExecutor("generate_random", executeGenerateRandom)
	DefaultRegistry.RegisterExecutor("encode_decode", executeEncodeDecode)
	DefaultRegistry.RegisterExecutor("format_json", executeFormatJSON)
	DefaultRegistry.RegisterExecutor("json_path", executeJSONPath)
	DefaultRegistry.RegisterExecutor("hash_text", executeHashText)
	DefaultRegistry.RegisterExecutor("convert_color", executeConvertColor)
}

// Time functions
func executeGetCurrentTime(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	tz, _ := args["timezone"].(string)
	format, _ := args["format"].(string)

	loc := time.Local
	if tz != "" {
		var err error
		loc, err = time.LoadLocation(tz)
		if err != nil {
			return ToolResult{Content: fmt.Sprintf("Invalid timezone: %v", err), IsError: true}
		}
	}

	now := time.Now().In(loc)

	var result string
	switch format {
	case "unix":
		result = fmt.Sprintf("%d", now.Unix())
	case "human":
		result = now.Format("Monday, January 2, 2006 at 3:04 PM MST")
	case "custom":
		result = now.Format(time.RFC3339)
	default: // iso
		result = now.Format(time.RFC3339)
	}

	return ToolResult{Content: fmt.Sprintf(`{"time": "%s", "timezone": "%s", "unix": %d}`, result, loc.String(), now.Unix())}
}

func executeConvertTimezone(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	timeStr, _ := args["time"].(string)
	fromTZ, _ := args["from_timezone"].(string)
	toTZ, _ := args["to_timezone"].(string)

	fromLoc, err := time.LoadLocation(fromTZ)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Invalid source timezone: %v", err), IsError: true}
	}

	toLoc, err := time.LoadLocation(toTZ)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Invalid target timezone: %v", err), IsError: true}
	}

	t, err := time.ParseInLocation(time.RFC3339, timeStr, fromLoc)
	if err != nil {
		t, err = time.ParseInLocation("2006-01-02 15:04:05", timeStr, fromLoc)
		if err != nil {
			return ToolResult{Content: fmt.Sprintf("Invalid time format: %v", err), IsError: true}
		}
	}

	converted := t.In(toLoc)
	return ToolResult{Content: fmt.Sprintf(`{"original": "%s", "converted": "%s", "from": "%s", "to": "%s"}`, t.Format(time.RFC3339), converted.Format(time.RFC3339), fromTZ, toTZ)}
}

func executeCalculateTimeDifference(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	startStr, _ := args["start"].(string)
	endStr, _ := args["end"].(string)
	unit, _ := args["unit"].(string)

	start, err := time.Parse(time.RFC3339, startStr)
	if err != nil {
		start, err = time.Parse("2006-01-02", startStr)
		if err != nil {
			return ToolResult{Content: fmt.Sprintf("Invalid start time: %v", err), IsError: true}
		}
	}

	end, err := time.Parse(time.RFC3339, endStr)
	if err != nil {
		end, err = time.Parse("2006-01-02", endStr)
		if err != nil {
			return ToolResult{Content: fmt.Sprintf("Invalid end time: %v", err), IsError: true}
		}
	}

	diff := end.Sub(start)
	var value float64

	switch unit {
	case "minutes":
		value = diff.Minutes()
	case "hours":
		value = diff.Hours()
	case "days":
		value = diff.Hours() / 24
	case "weeks":
		value = diff.Hours() / 24 / 7
	default: // seconds
		value = diff.Seconds()
		unit = "seconds"
	}

	return ToolResult{Content: fmt.Sprintf(`{"difference": %.2f, "unit": "%s"}`, value, unit)}
}

// Math functions
func executeCalculate(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	expr, _ := args["expression"].(string)

	// Simple expression evaluator for basic math
	// In production, use a proper expression parser
	expr = strings.TrimSpace(expr)
	expr = strings.ToLower(expr)

	// Handle common functions
	if strings.HasPrefix(expr, "sqrt(") {
		numStr := strings.TrimSuffix(strings.TrimPrefix(expr, "sqrt("), ")")
		num, err := strconv.ParseFloat(numStr, 64)
		if err != nil {
			return ToolResult{Content: fmt.Sprintf("Invalid number: %v", err), IsError: true}
		}
		return ToolResult{Content: fmt.Sprintf("%f", math.Sqrt(num))}
	}

	if strings.HasPrefix(expr, "pow(") {
		parts := strings.Split(strings.TrimSuffix(strings.TrimPrefix(expr, "pow("), ")"), ",")
		if len(parts) != 2 {
			return ToolResult{Content: "pow requires two arguments: pow(base, exponent)", IsError: true}
		}
		base, _ := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
		exp, _ := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
		return ToolResult{Content: fmt.Sprintf("%f", math.Pow(base, exp))}
	}

	// Basic arithmetic with regex
	addPattern := regexp.MustCompile(`^([\d.]+)\s*\+\s*([\d.]+)$`)
	subPattern := regexp.MustCompile(`^([\d.]+)\s*-\s*([\d.]+)$`)
	mulPattern := regexp.MustCompile(`^([\d.]+)\s*\*\s*([\d.]+)$`)
	divPattern := regexp.MustCompile(`^([\d.]+)\s*/\s*([\d.]+)$`)

	if matches := addPattern.FindStringSubmatch(expr); matches != nil {
		a, _ := strconv.ParseFloat(matches[1], 64)
		b, _ := strconv.ParseFloat(matches[2], 64)
		return ToolResult{Content: fmt.Sprintf("%f", a+b)}
	}
	if matches := subPattern.FindStringSubmatch(expr); matches != nil {
		a, _ := strconv.ParseFloat(matches[1], 64)
		b, _ := strconv.ParseFloat(matches[2], 64)
		return ToolResult{Content: fmt.Sprintf("%f", a-b)}
	}
	if matches := mulPattern.FindStringSubmatch(expr); matches != nil {
		a, _ := strconv.ParseFloat(matches[1], 64)
		b, _ := strconv.ParseFloat(matches[2], 64)
		return ToolResult{Content: fmt.Sprintf("%f", a*b)}
	}
	if matches := divPattern.FindStringSubmatch(expr); matches != nil {
		a, _ := strconv.ParseFloat(matches[1], 64)
		b, _ := strconv.ParseFloat(matches[2], 64)
		if b == 0 {
			return ToolResult{Content: "Division by zero", IsError: true}
		}
		return ToolResult{Content: fmt.Sprintf("%f", a/b)}
	}

	return ToolResult{Content: fmt.Sprintf("Could not parse expression: %s. Supported: basic arithmetic (+,-,*,/), sqrt(), pow()", expr), IsError: true}
}

func executeConvertUnits(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	value, _ := args["value"].(float64)
	fromUnit, _ := args["from_unit"].(string)
	toUnit, _ := args["to_unit"].(string)

	fromUnit = strings.ToLower(fromUnit)
	toUnit = strings.ToLower(toUnit)

	// Conversion factors to base units
	conversions := map[string]float64{
		// Length (base: meters)
		"m": 1, "meter": 1, "meters": 1,
		"km": 1000, "kilometer": 1000, "kilometers": 1000,
		"cm": 0.01, "centimeter": 0.01,
		"mm": 0.001, "millimeter": 0.001,
		"mi": 1609.344, "mile": 1609.344, "miles": 1609.344,
		"ft": 0.3048, "foot": 0.3048, "feet": 0.3048,
		"in": 0.0254, "inch": 0.0254, "inches": 0.0254,
		"yd": 0.9144, "yard": 0.9144, "yards": 0.9144,

		// Weight (base: grams)
		"g": 1, "gram": 1, "grams": 1,
		"kg": 1000, "kilogram": 1000, "kilograms": 1000,
		"mg": 0.001, "milligram": 0.001,
		"lb": 453.592, "lbs": 453.592, "pound": 453.592, "pounds": 453.592,
		"oz": 28.3495, "ounce": 28.3495, "ounces": 28.3495,
	}

	// Temperature is special
	if fromUnit == "celsius" || fromUnit == "c" {
		if toUnit == "fahrenheit" || toUnit == "f" {
			result := value*9/5 + 32
			return ToolResult{Content: fmt.Sprintf(`{"value": %.2f, "from": "%s", "to": "%s", "result": %.2f}`, value, fromUnit, toUnit, result)}
		}
		if toUnit == "kelvin" || toUnit == "k" {
			result := value + 273.15
			return ToolResult{Content: fmt.Sprintf(`{"value": %.2f, "from": "%s", "to": "%s", "result": %.2f}`, value, fromUnit, toUnit, result)}
		}
	}
	if fromUnit == "fahrenheit" || fromUnit == "f" {
		if toUnit == "celsius" || toUnit == "c" {
			result := (value - 32) * 5 / 9
			return ToolResult{Content: fmt.Sprintf(`{"value": %.2f, "from": "%s", "to": "%s", "result": %.2f}`, value, fromUnit, toUnit, result)}
		}
	}

	fromFactor, fromOK := conversions[fromUnit]
	toFactor, toOK := conversions[toUnit]

	if !fromOK || !toOK {
		return ToolResult{Content: fmt.Sprintf("Unknown unit: %s or %s", fromUnit, toUnit), IsError: true}
	}

	// Convert to base unit then to target
	result := value * fromFactor / toFactor
	return ToolResult{Content: fmt.Sprintf(`{"value": %.4f, "from": "%s", "to": "%s", "result": %.4f}`, value, fromUnit, toUnit, result)}
}

func executeCalculatePercentage(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	operation, _ := args["operation"].(string)
	value1, _ := args["value1"].(float64)
	value2, _ := args["value2"].(float64)

	var result float64
	var description string

	switch operation {
	case "of":
		result = value1 / 100 * value2
		description = fmt.Sprintf("%.2f%% of %.2f", value1, value2)
	case "change":
		if value1 == 0 {
			return ToolResult{Content: "Cannot calculate percentage change from zero", IsError: true}
		}
		result = ((value2 - value1) / value1) * 100
		description = fmt.Sprintf("Percentage change from %.2f to %.2f", value1, value2)
	case "is":
		if value2 == 0 {
			return ToolResult{Content: "Cannot divide by zero", IsError: true}
		}
		result = (value1 / value2) * 100
		description = fmt.Sprintf("%.2f is what %% of %.2f", value1, value2)
	}

	return ToolResult{Content: fmt.Sprintf(`{"result": %.4f, "description": "%s"}`, result, description)}
}

// String functions
func executeFormatText(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	text, _ := args["text"].(string)
	operation, _ := args["operation"].(string)

	var result string
	switch operation {
	case "uppercase":
		result = strings.ToUpper(text)
	case "lowercase":
		result = strings.ToLower(text)
	case "title_case":
		result = strings.Title(strings.ToLower(text))
	case "reverse":
		runes := []rune(text)
		for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
			runes[i], runes[j] = runes[j], runes[i]
		}
		result = string(runes)
	case "trim":
		result = strings.TrimSpace(text)
	case "slug":
		result = strings.ToLower(text)
		result = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(result, "-")
		result = strings.Trim(result, "-")
	case "camel_case":
		words := regexp.MustCompile(`[\s_-]+`).Split(text, -1)
		for i, word := range words {
			if i == 0 {
				words[i] = strings.ToLower(word)
			} else {
				words[i] = strings.Title(strings.ToLower(word))
			}
		}
		result = strings.Join(words, "")
	case "snake_case":
		result = regexp.MustCompile(`[\s-]+`).ReplaceAllString(text, "_")
		result = strings.ToLower(result)
	}

	return ToolResult{Content: result}
}

func executeCountText(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	text, _ := args["text"].(string)
	countType, _ := args["type"].(string)
	if countType == "" {
		countType = "characters"
	}

	var count int
	switch countType {
	case "characters":
		count = len([]rune(text))
	case "words":
		words := strings.Fields(text)
		count = len(words)
	case "lines":
		count = len(strings.Split(text, "\n"))
	case "sentences":
		count = len(regexp.MustCompile(`[.!?]+`).FindAllString(text, -1))
	}

	return ToolResult{Content: fmt.Sprintf(`{"count": %d, "type": "%s"}`, count, countType)}
}

func executeExtractFromText(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	text, _ := args["text"].(string)
	pattern, _ := args["pattern"].(string)

	// Preset patterns
	presets := map[string]string{
		"email":  `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`,
		"url":    `https?://[^\s<>"{}|\\^` + "`" + `\[\]]+`,
		"phone":  `[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}`,
		"number": `[-+]?\d*\.?\d+`,
	}

	if preset, ok := presets[pattern]; ok {
		pattern = preset
	}

	re, err := regexp.Compile(pattern)
	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Invalid regex pattern: %v", err), IsError: true}
	}

	matches := re.FindAllString(text, -1)
	result, _ := json.Marshal(matches)
	return ToolResult{Content: fmt.Sprintf(`{"matches": %s, "count": %d}`, string(result), len(matches))}
}

// ID generation
func executeGenerateUUID(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	version, _ := args["version"].(string)
	count := 1
	if c, ok := args["count"].(float64); ok && c > 0 {
		count = int(c)
		if count > 100 {
			count = 100
		}
	}

	uuids := make([]string, count)
	for i := 0; i < count; i++ {
		var id uuid.UUID
		if version == "v7" {
			id, _ = uuid.NewV7()
		} else {
			id = uuid.New()
		}
		uuids[i] = id.String()
	}

	if count == 1 {
		return ToolResult{Content: uuids[0]}
	}

	result, _ := json.Marshal(uuids)
	return ToolResult{Content: string(result)}
}

func executeGenerateRandom(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	randType, _ := args["type"].(string)
	length := 16
	if l, ok := args["length"].(float64); ok && l > 0 {
		length = int(l)
		if length > 1000 {
			length = 1000
		}
	}
	minVal := 0.0
	if m, ok := args["min"].(float64); ok {
		minVal = m
	}

	switch randType {
	case "number":
		bytes := make([]byte, 8)
		rand.Read(bytes)
		// Generate random number in range
		maxVal := float64(length)
		randFloat := float64(bytes[0])/255.0*(maxVal-minVal) + minVal
		return ToolResult{Content: fmt.Sprintf("%.0f", randFloat)}

	case "string":
		const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
		bytes := make([]byte, length)
		rand.Read(bytes)
		for i := range bytes {
			bytes[i] = charset[int(bytes[i])%len(charset)]
		}
		return ToolResult{Content: string(bytes)}

	case "hex":
		bytes := make([]byte, length/2+1)
		rand.Read(bytes)
		return ToolResult{Content: hex.EncodeToString(bytes)[:length]}

	case "base64":
		bytes := make([]byte, length)
		rand.Read(bytes)
		return ToolResult{Content: base64.StdEncoding.EncodeToString(bytes)[:length]}
	}

	return ToolResult{Content: "Unknown random type", IsError: true}
}

// Encoding
func executeEncodeDecode(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	data, _ := args["data"].(string)
	format, _ := args["format"].(string)
	operation, _ := args["operation"].(string)

	var result string
	var err error

	switch format {
	case "base64":
		if operation == "encode" {
			result = base64.StdEncoding.EncodeToString([]byte(data))
		} else {
			decoded, e := base64.StdEncoding.DecodeString(data)
			if e != nil {
				err = e
			} else {
				result = string(decoded)
			}
		}
	case "hex":
		if operation == "encode" {
			result = hex.EncodeToString([]byte(data))
		} else {
			decoded, e := hex.DecodeString(data)
			if e != nil {
				err = e
			} else {
				result = string(decoded)
			}
		}
	case "url":
		if operation == "encode" {
			result = strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(data, "%", "%25"), " ", "%20"), "&", "%26")
		} else {
			result = strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(data, "%20", " "), "%26", "&"), "%25", "%")
		}
	}

	if err != nil {
		return ToolResult{Content: fmt.Sprintf("Error: %v", err), IsError: true}
	}
	return ToolResult{Content: result}
}

// JSON functions
func executeFormatJSON(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	jsonStr, _ := args["json"].(string)
	operation, _ := args["operation"].(string)

	var data interface{}
	if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
		if operation == "validate" {
			return ToolResult{Content: fmt.Sprintf(`{"valid": false, "error": "%s"}`, err.Error())}
		}
		return ToolResult{Content: fmt.Sprintf("Invalid JSON: %v", err), IsError: true}
	}

	switch operation {
	case "validate":
		return ToolResult{Content: `{"valid": true}`}
	case "minify":
		result, _ := json.Marshal(data)
		return ToolResult{Content: string(result)}
	default: // format
		result, _ := json.MarshalIndent(data, "", "  ")
		return ToolResult{Content: string(result)}
	}
}

func executeJSONPath(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	jsonStr, _ := args["json"].(string)
	path, _ := args["path"].(string)

	var data interface{}
	if err := json.Unmarshal([]byte(jsonStr), &data); err != nil {
		return ToolResult{Content: fmt.Sprintf("Invalid JSON: %v", err), IsError: true}
	}

	// Simple path traversal (supports dot notation and array indices)
	parts := strings.Split(path, ".")
	current := data

	for _, part := range parts {
		// Handle array index
		if idx := strings.Index(part, "["); idx != -1 {
			key := part[:idx]
			indexStr := strings.TrimSuffix(part[idx+1:], "]")
			index, _ := strconv.Atoi(indexStr)

			if key != "" {
				if m, ok := current.(map[string]interface{}); ok {
					current = m[key]
				} else {
					return ToolResult{Content: fmt.Sprintf("Cannot access key '%s' on non-object", key), IsError: true}
				}
			}

			if arr, ok := current.([]interface{}); ok {
				if index >= 0 && index < len(arr) {
					current = arr[index]
				} else {
					return ToolResult{Content: fmt.Sprintf("Array index %d out of bounds", index), IsError: true}
				}
			} else {
				return ToolResult{Content: "Cannot index non-array", IsError: true}
			}
		} else {
			if m, ok := current.(map[string]interface{}); ok {
				current = m[part]
			} else {
				return ToolResult{Content: fmt.Sprintf("Cannot access key '%s' on non-object", part), IsError: true}
			}
		}
	}

	result, _ := json.Marshal(current)
	return ToolResult{Content: string(result)}
}

// Hash (placeholder - would need crypto imports)
func executeHashText(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	text, _ := args["text"].(string)
	algorithm, _ := args["algorithm"].(string)

	// Placeholder - in production would use crypto/sha256, crypto/md5, etc.
	return ToolResult{Content: fmt.Sprintf(`{"algorithm": "%s", "input_length": %d, "note": "Hash generation requires crypto library integration"}`, algorithm, len(text))}
}

// Color conversion (simplified)
func executeConvertColor(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	color, _ := args["color"].(string)
	toFormat, _ := args["to_format"].(string)

	// Parse hex color
	if strings.HasPrefix(color, "#") {
		hex := strings.TrimPrefix(color, "#")
		if len(hex) == 3 {
			hex = string([]byte{hex[0], hex[0], hex[1], hex[1], hex[2], hex[2]})
		}
		r, _ := strconv.ParseInt(hex[0:2], 16, 64)
		g, _ := strconv.ParseInt(hex[2:4], 16, 64)
		b, _ := strconv.ParseInt(hex[4:6], 16, 64)

		switch toFormat {
		case "rgb":
			return ToolResult{Content: fmt.Sprintf("rgb(%d, %d, %d)", r, g, b)}
		case "hsl":
			// Simplified HSL conversion
			rf := float64(r) / 255
			gf := float64(g) / 255
			bf := float64(b) / 255
			max := math.Max(rf, math.Max(gf, bf))
			min := math.Min(rf, math.Min(gf, bf))
			l := (max + min) / 2
			return ToolResult{Content: fmt.Sprintf("hsl(0, 0%%, %.0f%%)", l*100)}
		default:
			return ToolResult{Content: color}
		}
	}

	return ToolResult{Content: fmt.Sprintf("Color format conversion: %s to %s", color, toFormat)}
}
