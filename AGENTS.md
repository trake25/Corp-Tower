# Identity

At session start, report:
- Runtime/Product
- Model
- Effort, if available

Use authoritative session metadata/configuration only. Never infer or guess.

Runtime/Product and Model are required. If either cannot be identified, stop immediately and report the exact reason to the user.

# Route

Route by Runtime/Product.

Search the routed file for `#ENTRY#` and read only that entry section. Do not read the file in full.

- ChatGPT → `policy/CHATGPT.md`
- Codex → `policy/CODEX.md`

If no route matches the identified Runtime/Product, stop and report the routing failure and reason to the user.
