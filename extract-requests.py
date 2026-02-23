#!/usr/bin/env python3
"""
Extract all Claude Code requests from proxy log into readable text files.
Run this after sending messages through the proxy.
"""
import json
import os

LOG_FILE = "claude-code-requests.json"
OUT_DIR = "captured-prompts"

os.makedirs(OUT_DIR, exist_ok=True)

# Read and fix JSON (handles both array format and newline-delimited objects)
with open(LOG_FILE) as f:
    content = f.read().strip()

# Try as JSON array first
try:
    fixed = content.rstrip(',')
    if not fixed.endswith(']'):
        fixed += '\n]'
    if not fixed.startswith('['):
        fixed = '[\n' + fixed
    data = json.loads(fixed)
except json.JSONDecodeError:
    # Try as comma-separated objects (wrap in array)
    try:
        data = json.loads('[' + content.rstrip(',') + ']')
    except json.JSONDecodeError:
        # Try newline-delimited JSON objects
        data = []
        decoder = json.JSONDecoder()
        pos = 0
        while pos < len(content):
            # Skip whitespace and commas
            while pos < len(content) and content[pos] in ' \t\n\r,':
                pos += 1
            if pos >= len(content):
                break
            if content[pos] == '[':
                pos += 1
                continue
            if content[pos] == ']':
                pos += 1
                continue
            try:
                obj, end = decoder.raw_decode(content, pos)
                data.append(obj)
                pos = end
            except json.JSONDecodeError:
                pos += 1
print(f"Total requests captured: {len(data)}\n")

for i, req in enumerate(data):
    url = req.get('url', '')
    method = req.get('method', '')
    body = req.get('body', {})
    timestamp = req.get('timestamp', '')
    model = body.get('model', 'unknown')
    system = body.get('system', [])
    messages = body.get('messages', [])
    tools = body.get('tools', [])

    system_chars = sum(len(s.get('text', '')) for s in system) if isinstance(system, list) else 0
    msg_chars = 0
    for msg in messages:
        if isinstance(msg.get('content'), str):
            msg_chars += len(msg['content'])
        elif isinstance(msg.get('content'), list):
            for part in msg['content']:
                msg_chars += len(part.get('text', ''))

    # Determine request type
    if '/count_tokens' in url:
        req_type = 'count_tokens'
    elif system_chars < 500 and 'isNewTopic' in json.dumps(body.get('output_config', {})):
        req_type = 'topic_detection'
    elif system_chars > 2000:
        req_type = 'main_chat'
    else:
        req_type = 'other'

    print(f"[{i:3d}] {timestamp} | {method} {url}")
    print(f"      model={model} | type={req_type}")
    print(f"      system={system_chars} chars | messages={len(messages)} ({msg_chars} chars) | tools={len(tools)}")

    # Write detailed file for every request
    filename = f"{OUT_DIR}/{i:03d}_{req_type}_{model.replace('/', '_')}.txt"
    with open(filename, 'w') as out:
        out.write(f"Request #{i}\n")
        out.write(f"Timestamp: {timestamp}\n")
        out.write(f"Method: {method}\n")
        out.write(f"URL: {url}\n")
        out.write(f"Model: {model}\n")
        out.write(f"Type: {req_type}\n")
        out.write(f"System prompt chars: {system_chars}\n")
        out.write(f"Message chars: {msg_chars}\n")
        out.write(f"Tools count: {len(tools)}\n")
        out.write(f"\n{'='*80}\n")

        # System prompt
        if isinstance(system, list) and system:
            out.write("SYSTEM PROMPT\n")
            out.write(f"{'='*80}\n\n")
            for j, part in enumerate(system):
                text = part.get('text', '')
                cache = part.get('cache_control', {})
                cache_str = f" [cache: {cache.get('type', '')}]" if cache else ""
                out.write(f"--- Block {j} ({len(text)} chars){cache_str} ---\n")
                out.write(text)
                out.write("\n\n")

        # Messages
        if messages:
            out.write(f"{'='*80}\n")
            out.write("MESSAGES\n")
            out.write(f"{'='*80}\n\n")
            for msg in messages:
                role = msg.get('role', '?')
                out.write(f"[{role}]\n")
                content = msg.get('content', '')
                if isinstance(content, str):
                    out.write(content)
                elif isinstance(content, list):
                    for part in content:
                        ptype = part.get('type', '')
                        if ptype == 'text':
                            cache = part.get('cache_control', {})
                            cache_str = f" [cache: {cache.get('type', '')}]" if cache else ""
                            out.write(f"[{ptype}{cache_str}]\n")
                            out.write(part.get('text', ''))
                        elif ptype == 'tool_use':
                            out.write(f"[tool_use: {part.get('name', '?')}]\n")
                            out.write(json.dumps(part.get('input', {}), indent=2))
                        elif ptype == 'tool_result':
                            out.write(f"[tool_result: {part.get('tool_use_id', '?')}]\n")
                            tr_content = part.get('content', '')
                            if isinstance(tr_content, list):
                                for trc in tr_content:
                                    out.write(trc.get('text', str(trc)))
                            else:
                                out.write(str(tr_content))
                        else:
                            out.write(f"[{ptype}]\n")
                            out.write(json.dumps(part, indent=2))
                        out.write("\n\n")
                out.write("\n")

        # Tools
        if tools:
            out.write(f"{'='*80}\n")
            out.write(f"TOOLS ({len(tools)})\n")
            out.write(f"{'='*80}\n\n")
            for tool in tools:
                name = tool.get('name', '?')
                desc = tool.get('description', tool.get('input_schema', {}).get('description', ''))
                # Truncate description for readability
                if len(desc) > 200:
                    desc_preview = desc[:200] + "..."
                else:
                    desc_preview = desc
                out.write(f"- {name}\n  {desc_preview}\n\n")

        # Extra fields
        extras = {}
        for key in ['max_tokens', 'temperature', 'stream', 'thinking', 'output_config', 'context_management', 'metadata']:
            if key in body:
                extras[key] = body[key]
        if extras:
            out.write(f"{'='*80}\n")
            out.write("EXTRA PARAMETERS\n")
            out.write(f"{'='*80}\n\n")
            out.write(json.dumps(extras, indent=2))
            out.write("\n")

    print(f"      -> {filename}")
    print()

# Also write a raw JSON dump of everything (pretty-printed, full content)
raw_file = f"{OUT_DIR}/raw_all_requests.json"
with open(raw_file, 'w') as f:
    json.dump(data, f, indent=2)
print(f"\nRaw JSON: {raw_file}")
print(f"All files in: {OUT_DIR}/")
