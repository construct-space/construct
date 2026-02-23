package tools

import (
	"construct-context/providers"
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"regexp"
	"strconv"
	"strings"
)

// PathTools - Tools for SVG path creation and manipulation
func init() {
	category := &ToolCategory{
		Name:        "path",
		Description: "SVG Path tools for creating and manipulating vector paths, bezier curves, and path points",
		Tools: []providers.Tool{
			MakeTool("create_path",
				`Create an SVG path element. Path data uses standard SVG commands:
- M x y: Move to point (start path)
- L x y: Line to point
- C x1 y1 x2 y2 x y: Cubic bezier curve (x1,y1=control1, x2,y2=control2, x,y=endpoint)
- Q x1 y1 x y: Quadratic bezier curve (x1,y1=control, x,y=endpoint)
- Z: Close path (connect back to start)

Examples:
- Triangle: "M 0 100 L 50 0 L 100 100 Z"
- Rounded rectangle: "M 10 0 L 90 0 Q 100 0 100 10 L 100 90 Q 100 100 90 100 L 10 100 Q 0 100 0 90 L 0 10 Q 0 0 10 0 Z"
- Heart: "M 50 90 C 20 60 0 30 25 10 C 50 -10 50 20 50 30 C 50 20 50 -10 75 10 C 100 30 80 60 50 90 Z"
- Smooth wave: "M 0 50 C 25 0 75 100 100 50"`,
				map[string]providers.Property{
					"path_data":    {Type: "string", Description: "SVG path data string (M, L, C, Q, Z commands)"},
					"name":         {Type: "string", Description: "Element name for layers panel"},
					"x":            {Type: "number", Description: "X position on canvas (default: 100)"},
					"y":            {Type: "number", Description: "Y position on canvas (default: 100)"},
					"stroke":       {Type: "string", Description: "Stroke color hex (default: #0d99ff)"},
					"stroke_width": {Type: "number", Description: "Stroke width (default: 2)"},
					"fill":         {Type: "string", Description: "Fill color hex (default: transparent, use solid color for closed paths)"},
					"parent_id":    {Type: "string", Description: "Parent element ID for nesting inside screens"},
				}, []string{"path_data", "name"}),

			MakeTool("generate_path_data",
				`Generate SVG path data for common shapes. Returns path_data string to use with create_path.`,
				map[string]providers.Property{
					"shape":         {Type: "string", Description: "Shape type: 'circle', 'arc', 'spiral', 'wave', 'zigzag', 'arrow', 'heart', 'star', 'gear', 'speech_bubble', 'rounded_rect', 'pill', 'hexagon', 'octagon', 'cross', 'ring'"},
					"width":         {Type: "number", Description: "Shape width (default: 100)"},
					"height":        {Type: "number", Description: "Shape height (default: 100)"},
					"points":        {Type: "number", Description: "Number of points for star (default: 5)"},
					"inner_radius":  {Type: "number", Description: "Inner radius ratio 0-1 for star/gear (default: 0.5)"},
					"teeth":         {Type: "number", Description: "Number of teeth for gear (default: 8)"},
					"corner_radius": {Type: "number", Description: "Corner radius for rounded_rect (default: 10)"},
					"amplitude":     {Type: "number", Description: "Wave amplitude (default: 20)"},
					"frequency":     {Type: "number", Description: "Wave frequency/cycles (default: 3)"},
					"start_angle":   {Type: "number", Description: "Arc start angle in degrees (default: 0)"},
					"end_angle":     {Type: "number", Description: "Arc end angle in degrees (default: 270)"},
					"thickness":     {Type: "number", Description: "Ring thickness (default: 10)"},
				}, []string{"shape"}),

			MakeTool("path_info",
				"Get information about an SVG path: number of points, commands used, whether it's closed, bounding box estimate.",
				map[string]providers.Property{
					"path_data": {Type: "string", Description: "SVG path data to analyze"},
				}, []string{"path_data"}),

			MakeTool("transform_path",
				"Transform path data: scale, rotate, translate, or flip the path.",
				map[string]providers.Property{
					"path_data":   {Type: "string", Description: "SVG path data to transform"},
					"scale_x":     {Type: "number", Description: "Scale factor X (default: 1)"},
					"scale_y":     {Type: "number", Description: "Scale factor Y (default: 1)"},
					"rotate":      {Type: "number", Description: "Rotation in degrees around center"},
					"translate_x": {Type: "number", Description: "Translate X offset"},
					"translate_y": {Type: "number", Description: "Translate Y offset"},
					"flip_x":      {Type: "boolean", Description: "Flip horizontally"},
					"flip_y":      {Type: "boolean", Description: "Flip vertically"},
				}, []string{"path_data"}),

			MakeTool("combine_paths",
				"Combine multiple paths into a single path. Useful for creating complex shapes from simpler ones.",
				map[string]providers.Property{
					"paths": {Type: "array", Description: "Array of path data strings to combine"},
				}, []string{"paths"}),

			MakeTool("smooth_path",
				"Convert a path with sharp corners (L commands) to smooth bezier curves (C commands). Creates flowing, organic shapes.",
				map[string]providers.Property{
					"path_data": {Type: "string", Description: "SVG path data with L commands to smooth"},
					"tension":   {Type: "number", Description: "Smoothing tension 0-1 (default: 0.3, higher = smoother curves)"},
				}, []string{"path_data"}),
		},
	}

	DefaultRegistry.RegisterCategory(category)

	DefaultRegistry.RegisterExecutor("create_path", executeCreatePath)
	DefaultRegistry.RegisterExecutor("generate_path_data", executeGeneratePathData)
	DefaultRegistry.RegisterExecutor("path_info", executePathInfo)
	DefaultRegistry.RegisterExecutor("transform_path", executeTransformPath)
	DefaultRegistry.RegisterExecutor("combine_paths", executeCombinePaths)
	DefaultRegistry.RegisterExecutor("smooth_path", executeSmoothPath)
}

func executeCreatePath(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	pathData, _ := args["path_data"].(string)
	name, _ := args["name"].(string)
	x, _ := args["x"].(float64)
	y, _ := args["y"].(float64)
	stroke, _ := args["stroke"].(string)
	strokeWidth, _ := args["stroke_width"].(float64)
	fill, _ := args["fill"].(string)
	parentID, _ := args["parent_id"].(string)

	// Defaults
	if x == 0 {
		x = 100
	}
	if y == 0 {
		y = 100
	}
	if stroke == "" {
		stroke = "#0d99ff"
	}
	if strokeWidth == 0 {
		strokeWidth = 2
	}
	if fill == "" {
		fill = "transparent"
	}

	// Generate unique ID
	id := fmt.Sprintf("path-%d-%s", randomInt(1000, 9999), randomString(6))

	// Build element data
	element := map[string]interface{}{
		"id":          id,
		"type":        "path",
		"name":        name,
		"x":           x,
		"y":           y,
		"pathData":    pathData,
		"stroke":      stroke,
		"strokeWidth": strokeWidth,
		"fill":        fill,
		"visible":     true,
		"locked":      false,
		"opacity":     1,
	}

	if parentID != "" {
		element["parentId"] = parentID
	}

	result := map[string]interface{}{
		"success": true,
		"element": element,
		"message": fmt.Sprintf("Created path '%s' with ID %s", name, id),
		"action": map[string]interface{}{
			"type":    "create_element",
			"payload": element,
		},
	}

	respJSON, _ := json.Marshal(result)
	return ToolResult{Content: string(respJSON)}
}

func executeGeneratePathData(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	shape, _ := args["shape"].(string)
	width, _ := args["width"].(float64)
	height, _ := args["height"].(float64)
	points, _ := args["points"].(float64)
	innerRadius, _ := args["inner_radius"].(float64)
	teeth, _ := args["teeth"].(float64)
	cornerRadius, _ := args["corner_radius"].(float64)
	amplitude, _ := args["amplitude"].(float64)
	frequency, _ := args["frequency"].(float64)
	startAngle, _ := args["start_angle"].(float64)
	endAngle, _ := args["end_angle"].(float64)
	thickness, _ := args["thickness"].(float64)

	// Defaults
	if width == 0 {
		width = 100
	}
	if height == 0 {
		height = 100
	}
	if points == 0 {
		points = 5
	}
	if innerRadius == 0 {
		innerRadius = 0.5
	}
	if teeth == 0 {
		teeth = 8
	}
	if cornerRadius == 0 {
		cornerRadius = 10
	}
	if amplitude == 0 {
		amplitude = 20
	}
	if frequency == 0 {
		frequency = 3
	}
	if endAngle == 0 {
		endAngle = 270
	}
	if thickness == 0 {
		thickness = 10
	}

	var pathData string

	switch shape {
	case "circle":
		r := width / 2
		k := r * 0.5522847498
		pathData = fmt.Sprintf("M %.2f 0 C %.2f 0 %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f 0 %.2f C 0 %.2f 0 %.2f %.2f %.2f C %.2f %.2f %.2f 0 %.2f 0 Z",
			r, r+k, width, r-k, width, r,
			width, r+k, r+k, height, r,
			height, r-k, height, r+k,
			0.0, r-k, r-k, r)

	case "arc":
		cx, cy := width/2, height/2
		rx, ry := width/2, height/2
		startRad := startAngle * math.Pi / 180
		endRad := endAngle * math.Pi / 180
		x1 := cx + rx*math.Cos(startRad)
		y1 := cy + ry*math.Sin(startRad)
		x2 := cx + rx*math.Cos(endRad)
		y2 := cy + ry*math.Sin(endRad)
		largeArc := 0
		if endAngle-startAngle > 180 {
			largeArc = 1
		}
		pathData = fmt.Sprintf("M %.2f %.2f A %.2f %.2f 0 %d 1 %.2f %.2f", x1, y1, rx, ry, largeArc, x2, y2)

	case "wave":
		pathData = fmt.Sprintf("M 0 %.2f", height/2)
		segments := int(frequency * 10)
		for i := 1; i <= segments; i++ {
			x := float64(i) * width / float64(segments)
			y := height/2 + amplitude*math.Sin(float64(i)*2*math.Pi*frequency/float64(segments))
			prevX := float64(i-1) * width / float64(segments)
			pathData += fmt.Sprintf(" C %.2f %.2f %.2f %.2f %.2f %.2f", (prevX+x)/2, y, (prevX+x)/2, y, x, y)
		}

	case "zigzag":
		pathData = fmt.Sprintf("M 0 %.2f", height/2)
		segments := int(frequency * 2)
		for i := 1; i <= segments; i++ {
			x := float64(i) * width / float64(segments)
			y := height / 2
			if i%2 == 1 {
				y = height/2 - amplitude
			} else {
				y = height/2 + amplitude
			}
			pathData += fmt.Sprintf(" L %.2f %.2f", x, y)
		}

	case "heart":
		w, h := width, height
		pathData = fmt.Sprintf("M %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f Z",
			w/2, h*0.9,
			w*0.2, h*0.65, 0.0, h*0.35, w*0.25, h*0.15,
			w*0.4, 0.0, w/2, h*0.1, w/2, h*0.25,
			w/2, h*0.1, w*0.6, 0.0, w*0.75, h*0.15,
			w, h*0.35, w*0.8, h*0.65, w/2, h*0.9)

	case "star":
		pathData = generateStar(width/2, height/2, width/2, innerRadius, int(points))

	case "rounded_rect":
		r := cornerRadius
		if r > width/2 {
			r = width / 2
		}
		if r > height/2 {
			r = height / 2
		}
		pathData = fmt.Sprintf("M %.2f 0 L %.2f 0 Q %.2f 0 %.2f %.2f L %.2f %.2f Q %.2f %.2f %.2f %.2f L %.2f %.2f Q 0 %.2f 0 %.2f L 0 %.2f Q 0 0 %.2f 0 Z",
			r, width-r, width, width, r, width, height-r, width, height, width-r, height, r, height, height, height-r, r, r)

	case "pill":
		r := height / 2
		pathData = fmt.Sprintf("M %.2f 0 L %.2f 0 Q %.2f 0 %.2f %.2f Q %.2f %.2f %.2f %.2f L %.2f %.2f Q 0 %.2f 0 %.2f Q 0 0 %.2f 0 Z",
			r, width-r, width, width, r, width, height, width-r, height, r, height, height, r, r)

	case "hexagon":
		pathData = generateRegularPolygon(width/2, height/2, width/2, 6)

	case "octagon":
		pathData = generateRegularPolygon(width/2, height/2, width/2, 8)

	case "cross":
		armWidth := width / 3
		pathData = fmt.Sprintf("M %.2f 0 L %.2f 0 L %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f Z",
			armWidth, armWidth*2,
			armWidth*2, armWidth, width, armWidth, width, armWidth*2,
			armWidth*2, armWidth*2, armWidth*2, height,
			armWidth, height, armWidth, armWidth*2,
			0.0, armWidth*2, 0.0, armWidth, armWidth, armWidth)

	case "ring":
		outer := width / 2
		inner := outer - thickness
		k := 0.5522847498
		pathData = fmt.Sprintf("M %.2f 0 C %.2f 0 %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f 0 %.2f 0 Z",
			outer, outer+outer*k, width, outer-outer*k, width, outer,
			width, outer+outer*k, outer+outer*k, height, outer, height,
			outer-outer*k, height, 0.0, outer+outer*k, 0.0, outer,
			0.0, outer-outer*k, outer-outer*k, outer)
		cx := outer
		pathData += fmt.Sprintf(" M %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f Z",
			cx+inner, outer,
			cx+inner, outer-inner*k, cx+inner*k, outer-inner, cx, outer-inner,
			cx-inner*k, outer-inner, cx-inner, outer-inner*k, cx-inner, outer,
			cx-inner, outer+inner*k, cx-inner*k, outer+inner, cx, outer+inner,
			cx+inner*k, outer+inner, cx+inner, outer+inner*k, cx+inner, outer)

	case "arrow":
		pathData = fmt.Sprintf("M 0 %.2f L %.2f %.2f L %.2f %.2f L %.2f 0 L %.2f %.2f L %.2f %.2f L %.2f %.2f Z",
			height/2, width*0.6, height/2, width*0.6, height*0.2,
			width,
			width*0.6, height*0.8, width*0.6, height/2, 0.0, height/2)

	case "speech_bubble":
		r := cornerRadius
		pathData = fmt.Sprintf("M %.2f 0 L %.2f 0 Q %.2f 0 %.2f %.2f L %.2f %.2f Q %.2f %.2f %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f L %.2f %.2f Q 0 %.2f 0 %.2f L 0 %.2f Q 0 0 %.2f 0 Z",
			r, width-r, width, width, r, width, height*0.7-r, width, height*0.7, width-r, height*0.7,
			width*0.4, height*0.7, width*0.3, height, width*0.2, height*0.7,
			r, height*0.7, height*0.7, height*0.7-r, r, r)

	case "gear":
		pathData = generateGear(width/2, height/2, width/2, int(teeth), innerRadius)

	default:
		result := map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Unknown shape: %s. Supported: circle, arc, wave, zigzag, heart, star, rounded_rect, pill, hexagon, octagon, cross, ring, arrow, speech_bubble, gear", shape),
		}
		respJSON, _ := json.Marshal(result)
		return ToolResult{Content: string(respJSON)}
	}

	result := map[string]interface{}{
		"success":   true,
		"path_data": pathData,
		"shape":     shape,
		"width":     width,
		"height":    height,
	}
	respJSON, _ := json.Marshal(result)
	return ToolResult{Content: string(respJSON)}
}

func executePathInfo(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	pathData, _ := args["path_data"].(string)

	cmdRegex := regexp.MustCompile(`([MLCQAHVSZTMLCQAHVSZ])([^MLCQAHVSZTMLCQAHVSZ]*)`)
	matches := cmdRegex.FindAllStringSubmatch(strings.ToUpper(pathData), -1)

	commands := make(map[string]int)
	var points [][]float64
	var minX, minY, maxX, maxY float64 = math.MaxFloat64, math.MaxFloat64, -math.MaxFloat64, -math.MaxFloat64

	for _, match := range matches {
		cmd := match[1]
		commands[cmd]++

		numRegex := regexp.MustCompile(`-?\d+\.?\d*`)
		nums := numRegex.FindAllString(match[2], -1)

		switch cmd {
		case "M", "L":
			if len(nums) >= 2 {
				x, _ := strconv.ParseFloat(nums[0], 64)
				y, _ := strconv.ParseFloat(nums[1], 64)
				points = append(points, []float64{x, y})
				updateBounds(&minX, &minY, &maxX, &maxY, x, y)
			}
		case "C":
			if len(nums) >= 6 {
				x, _ := strconv.ParseFloat(nums[4], 64)
				y, _ := strconv.ParseFloat(nums[5], 64)
				points = append(points, []float64{x, y})
				for i := 0; i < 6; i += 2 {
					cx, _ := strconv.ParseFloat(nums[i], 64)
					cy, _ := strconv.ParseFloat(nums[i+1], 64)
					updateBounds(&minX, &minY, &maxX, &maxY, cx, cy)
				}
			}
		case "Q":
			if len(nums) >= 4 {
				x, _ := strconv.ParseFloat(nums[2], 64)
				y, _ := strconv.ParseFloat(nums[3], 64)
				points = append(points, []float64{x, y})
				updateBounds(&minX, &minY, &maxX, &maxY, x, y)
			}
		}
	}

	isClosed := commands["Z"] > 0

	result := map[string]interface{}{
		"success":     true,
		"point_count": len(points),
		"commands":    commands,
		"is_closed":   isClosed,
		"bounding_box": map[string]float64{
			"minX":   minX,
			"minY":   minY,
			"maxX":   maxX,
			"maxY":   maxY,
			"width":  maxX - minX,
			"height": maxY - minY,
		},
	}
	respJSON, _ := json.Marshal(result)
	return ToolResult{Content: string(respJSON)}
}

func executeTransformPath(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	pathData, _ := args["path_data"].(string)
	scaleX, hasScaleX := args["scale_x"].(float64)
	scaleY, hasScaleY := args["scale_y"].(float64)
	rotate, _ := args["rotate"].(float64)
	translateX, _ := args["translate_x"].(float64)
	translateY, _ := args["translate_y"].(float64)
	flipX, _ := args["flip_x"].(bool)
	flipY, _ := args["flip_y"].(bool)

	if !hasScaleX {
		scaleX = 1
	}
	if !hasScaleY {
		scaleY = 1
	}
	if flipX {
		scaleX = -scaleX
	}
	if flipY {
		scaleY = -scaleY
	}

	rotRad := rotate * math.Pi / 180

	pairRegex := regexp.MustCompile(`(-?\d+\.?\d*)\s+(-?\d+\.?\d*)`)
	transformedPath := pairRegex.ReplaceAllStringFunc(pathData, func(s string) string {
		parts := strings.Fields(s)
		if len(parts) >= 2 {
			x, _ := strconv.ParseFloat(parts[0], 64)
			y, _ := strconv.ParseFloat(parts[1], 64)

			x *= scaleX
			y *= scaleY

			if rotate != 0 {
				newX := x*math.Cos(rotRad) - y*math.Sin(rotRad)
				newY := x*math.Sin(rotRad) + y*math.Cos(rotRad)
				x, y = newX, newY
			}

			x += translateX
			y += translateY

			return fmt.Sprintf("%.2f %.2f", x, y)
		}
		return s
	})

	result := map[string]interface{}{
		"success":   true,
		"path_data": transformedPath,
	}
	respJSON, _ := json.Marshal(result)
	return ToolResult{Content: string(respJSON)}
}

func executeCombinePaths(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	pathsRaw, _ := args["paths"].([]interface{})

	var combined string
	for _, p := range pathsRaw {
		if pathStr, ok := p.(string); ok {
			if combined != "" {
				combined += " "
			}
			combined += pathStr
		}
	}

	result := map[string]interface{}{
		"success":   true,
		"path_data": combined,
		"count":     len(pathsRaw),
	}
	respJSON, _ := json.Marshal(result)
	return ToolResult{Content: string(respJSON)}
}

func executeSmoothPath(args map[string]interface{}, ctx *ExecutionContext) ToolResult {
	pathData, _ := args["path_data"].(string)
	tension, hasTension := args["tension"].(float64)

	if !hasTension {
		tension = 0.3
	}

	var points [][]float64
	cmdRegex := regexp.MustCompile(`([ML])\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)`)
	matches := cmdRegex.FindAllStringSubmatch(pathData, -1)

	for _, m := range matches {
		x, _ := strconv.ParseFloat(m[2], 64)
		y, _ := strconv.ParseFloat(m[3], 64)
		points = append(points, []float64{x, y})
	}

	if len(points) < 2 {
		result := map[string]interface{}{
			"success": false,
			"error":   "Need at least 2 points to smooth",
		}
		respJSON, _ := json.Marshal(result)
		return ToolResult{Content: string(respJSON)}
	}

	isClosed := strings.Contains(strings.ToUpper(pathData), "Z")
	smoothed := fmt.Sprintf("M %.2f %.2f", points[0][0], points[0][1])

	for i := 1; i < len(points); i++ {
		prev := points[i-1]
		curr := points[i]

		var prevPrev, next []float64
		if i > 1 {
			prevPrev = points[i-2]
		} else if isClosed {
			prevPrev = points[len(points)-2]
		} else {
			prevPrev = prev
		}
		if i < len(points)-1 {
			next = points[i+1]
		} else if isClosed {
			next = points[1]
		} else {
			next = curr
		}

		c1x := prev[0] + (curr[0]-prevPrev[0])*tension
		c1y := prev[1] + (curr[1]-prevPrev[1])*tension
		c2x := curr[0] - (next[0]-prev[0])*tension
		c2y := curr[1] - (next[1]-prev[1])*tension

		smoothed += fmt.Sprintf(" C %.2f %.2f %.2f %.2f %.2f %.2f", c1x, c1y, c2x, c2y, curr[0], curr[1])
	}

	if isClosed {
		prev := points[len(points)-1]
		curr := points[0]
		prevPrev := points[len(points)-2]
		next := points[1]

		c1x := prev[0] + (curr[0]-prevPrev[0])*tension
		c1y := prev[1] + (curr[1]-prevPrev[1])*tension
		c2x := curr[0] - (next[0]-prev[0])*tension
		c2y := curr[1] - (next[1]-prev[1])*tension

		smoothed += fmt.Sprintf(" C %.2f %.2f %.2f %.2f %.2f %.2f Z", c1x, c1y, c2x, c2y, curr[0], curr[1])
	}

	result := map[string]interface{}{
		"success":     true,
		"path_data":   smoothed,
		"point_count": len(points),
		"tension":     tension,
	}
	respJSON, _ := json.Marshal(result)
	return ToolResult{Content: string(respJSON)}
}

// Helper functions

func generateStar(cx, cy, radius, innerRadiusRatio float64, numPoints int) string {
	innerRadius := radius * innerRadiusRatio
	path := ""

	for i := 0; i < numPoints*2; i++ {
		angle := float64(i)*math.Pi/float64(numPoints) - math.Pi/2
		r := radius
		if i%2 == 1 {
			r = innerRadius
		}
		x := cx + r*math.Cos(angle)
		y := cy + r*math.Sin(angle)

		if i == 0 {
			path = fmt.Sprintf("M %.2f %.2f", x, y)
		} else {
			path += fmt.Sprintf(" L %.2f %.2f", x, y)
		}
	}
	return path + " Z"
}

func generateRegularPolygon(cx, cy, radius float64, sides int) string {
	path := ""
	for i := 0; i < sides; i++ {
		angle := float64(i)*2*math.Pi/float64(sides) - math.Pi/2
		x := cx + radius*math.Cos(angle)
		y := cy + radius*math.Sin(angle)

		if i == 0 {
			path = fmt.Sprintf("M %.2f %.2f", x, y)
		} else {
			path += fmt.Sprintf(" L %.2f %.2f", x, y)
		}
	}
	return path + " Z"
}

func generateGear(cx, cy, radius float64, teeth int, innerRatio float64) string {
	innerRadius := radius * innerRatio
	toothDepth := radius * 0.15
	path := ""

	for i := 0; i < teeth; i++ {
		baseAngle := float64(i) * 2 * math.Pi / float64(teeth)
		toothWidth := math.Pi / float64(teeth) * 0.6

		a1 := baseAngle - toothWidth/2
		a2 := baseAngle + toothWidth/2
		a3 := baseAngle + math.Pi/float64(teeth) - toothWidth/2
		a4 := baseAngle + math.Pi/float64(teeth) + toothWidth/2

		x1 := cx + radius*math.Cos(a1)
		y1 := cy + radius*math.Sin(a1)
		x2 := cx + radius*math.Cos(a2)
		y2 := cy + radius*math.Sin(a2)
		x3 := cx + (radius-toothDepth)*math.Cos(a3)
		y3 := cy + (radius-toothDepth)*math.Sin(a3)
		x4 := cx + (radius-toothDepth)*math.Cos(a4)
		y4 := cy + (radius-toothDepth)*math.Sin(a4)

		if i == 0 {
			path = fmt.Sprintf("M %.2f %.2f", x1, y1)
		}
		path += fmt.Sprintf(" L %.2f %.2f L %.2f %.2f L %.2f %.2f", x2, y2, x3, y3, x4, y4)
		if i < teeth-1 {
			nextA1 := float64(i+1)*2*math.Pi/float64(teeth) - toothWidth/2
			nextX1 := cx + radius*math.Cos(nextA1)
			nextY1 := cy + radius*math.Sin(nextA1)
			path += fmt.Sprintf(" L %.2f %.2f", nextX1, nextY1)
		}
	}

	path += " Z"

	k := 0.5522847498
	path += fmt.Sprintf(" M %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f C %.2f %.2f %.2f %.2f %.2f %.2f Z",
		cx+innerRadius, cy,
		cx+innerRadius, cy-innerRadius*k, cx+innerRadius*k, cy-innerRadius, cx, cy-innerRadius,
		cx-innerRadius*k, cy-innerRadius, cx-innerRadius, cy-innerRadius*k, cx-innerRadius, cy,
		cx-innerRadius, cy+innerRadius*k, cx-innerRadius*k, cy+innerRadius, cx, cy+innerRadius,
		cx+innerRadius*k, cy+innerRadius, cx+innerRadius, cy+innerRadius*k, cx+innerRadius, cy)

	return path
}

func updateBounds(minX, minY, maxX, maxY *float64, x, y float64) {
	if x < *minX {
		*minX = x
	}
	if y < *minY {
		*minY = y
	}
	if x > *maxX {
		*maxX = x
	}
	if y > *maxY {
		*maxY = y
	}
}

func randomInt(min, max int) int {
	return min + rand.Intn(max-min+1)
}
