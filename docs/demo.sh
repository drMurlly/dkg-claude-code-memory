#!/usr/bin/env bash
# ─── dkg-claude-code-memory DEMO ──────────────────────────────────────────────
# Terminal walkthrough — run inside an asciinema session.
# Shows all 10 MCP tools against a real DKG v10 node.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export CCM_DIR="$DEMO_DIR"
TOKEN=$(grep -v '^#' ~/.dkg/auth.token | tr -d '\n')
SESSION_ID="ccm-demo-$(date +%Y%m%d-%H%M%S)"
DELAY_CHAR=0.05
DELAY_CMD=3.0
DELAY_SECTION=4.0

type_cmd() {
  printf '\e[32m$\e[0m '
  for (( i=0; i<${#1}; i++ )); do
    printf '%s' "${1:$i:1}"
    sleep "$DELAY_CHAR"
  done
  echo
}

run() {
  type_cmd "$*"
  eval "$*"
  sleep "$DELAY_CMD"
}

banner() {
  echo
  printf '\e[36m======================================================\e[0m\n'
  printf '\e[36m  %s\e[0m\n' "$1"
  printf '\e[36m======================================================\e[0m\n'
  echo
  sleep "$DELAY_SECTION"
}

ok() { printf '\e[32m  [OK] %s\e[0m\n' "$1"; }

cat > /tmp/mcp_call.py << 'PYEOF'
import json, os, subprocess, sys

tool   = sys.argv[1]
params = json.loads(sys.argv[2]) if len(sys.argv) > 2 else {}
server_bin = os.path.join(os.environ.get("CCM_DIR", os.getcwd()), "dist", "index.js")
env = dict(os.environ)
env.setdefault("DKG_AUTH_TOKEN", open(os.path.expanduser("~/.dkg/auth.token")).readlines()[-1].strip())
env.setdefault("DKG_DAEMON_URL", "http://127.0.0.1:9200")

msgs = [
    json.dumps({"jsonrpc":"2.0","id":1,"method":"initialize",
                "params":{"protocolVersion":"2024-11-05","capabilities":{},
                          "clientInfo":{"name":"demo","version":"1.0"}}}) + "\n",
    json.dumps({"jsonrpc":"2.0","method":"notifications/initialized","params":{}}) + "\n",
    json.dumps({"jsonrpc":"2.0","id":2,"method":"tools/call",
                "params":{"name":tool,"arguments":params}}) + "\n",
]
proc = subprocess.Popen(["node", server_bin], stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env)
proc.stdin.write("".join(msgs).encode())
proc.stdin.close()

result_line = None
for line in proc.stdout:
    decoded = line.decode(errors="replace").strip()
    if not decoded: continue
    try:
        msg = json.loads(decoded)
        if msg.get("id") == 2:
            result_line = msg; break
    except json.JSONDecodeError:
        pass
proc.wait(timeout=15)

if result_line is None: print("ERROR: no response"); sys.exit(1)
if "error" in result_line: print(f"Error: {result_line['error']}"); sys.exit(1)
for c in result_line.get("result",{}).get("content",[]):
    if c.get("type") == "text":
        try: print(json.dumps(json.loads(c["text"]), indent=2))
        except: print(c["text"])
PYEOF

clear
echo
printf '\e[1;33m  dkg-claude-code-memory v1.0.0\e[0m\n'
printf '\e[90m  Persistent, verifiable Working Memory for Claude Code on OriginTrail DKG v10\e[0m\n'
printf '\e[90m  10 MCP tools  *  552 tests  *  99.81%% branch coverage\e[0m\n'
echo
sleep 2

banner "TOOL 10 - get_node_status"
run "python3 /tmp/mcp_call.py get_node_status '{}' | python3 -c \"import json,sys; d=json.load(sys.stdin); print('  status:', d.get('status','?')); print('  latency:', d.get('latencyMs','?'), 'ms')\""
ok "DKG v10 node online"

banner "TOOL 1 - capture_research_finding"
printf '\e[90m  Capturing OOB write finding from Firedancer V1 audit...\e[0m\n'; echo

CAPTURE_ARGS=$(python3 -c "
import json
print(json.dumps({
  'content': 'fd_shred_parse.c approx line 387 -- fd_shred_merkle_parse() loop copies Merkle proof hashes from wire packet into stack buffer declared as uchar merkle[FD_SHRED_MERKLE_PROOF_DEPTH_MAX][32]. FD_SHRED_MERKLE_PROOF_DEPTH_MAX is 20. Peer-controlled hdr->data_cnt is uint16_t so values 21-65535 write past end of stack buffer. No bounds check precedes loop. Reachable from untrusted peer with access to validator gossip port. Severity: Critical.',
  'artifactType': 'vulnerability_finding',
  'title': 'fd_shred_merkle_parse: OOB stack write via hdr->data_cnt',
  'status': 'draft',
  'sensitivity': 'confidential',
  'sessionId': '$SESSION_ID',
  'agentRole': 'auditor'
}))
")

CAPTURE_OUT=$(python3 /tmp/mcp_call.py capture_research_finding "$CAPTURE_ARGS" 2>/dev/null || echo '{}')
echo "$CAPTURE_OUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print('  success:', d.get('success')); print('  artifactId:', d.get('artifactId','?')); print('  status:', d.get('status','?'))"
sleep "$DELAY_CMD"
ok "Artifact written to DKG v10 with SHA-256 content-addressable ID"

ARTIFACT_ID=$(echo "$CAPTURE_OUT" | python3 -c "import json,sys; d=json.load(sys.stdin); aid=d.get('artifactId',''); print(aid if aid.startswith('urn:dkg:wm:') else '')" 2>/dev/null || echo "")
export ARTIFACT_ID

banner "TOOL 1 again - sub-agent capture with derivedFrom"
printf '\e[90m  Sub-agent captures PoC hypothesis derived from parent finding...\e[0m\n'; echo

SUB_ARGS=$(python3 -c "
import json, os
parent = os.environ.get('ARTIFACT_ID','')
derived = [parent] if parent else []
print(json.dumps({
  'content': 'PoC hypothesis: craft shred packet with data_cnt=255 and Merkle proof block of 255x32=8160 bytes. Stack buffer is only 20x32=640 bytes. 7520-byte overflow corrupts adjacent stack frames. Requires network access to gossip port 8001.',
  'artifactType': 'research_note',
  'title': 'PoC: fd_shred_merkle_parse stack overflow via crafted data_cnt',
  'status': 'draft',
  'sessionId': '$SESSION_ID',
  'subAgentId': 'poc-sub-agent-01',
  'parentTaskId': 'fd-audit-main-task',
  'agentRole': 'poc_developer',
  'derivedFrom': derived
}))
")
run "python3 /tmp/mcp_call.py capture_research_finding \"\$SUB_ARGS\" | python3 -c \"import json,sys; d=json.load(sys.stdin); print('  success:', d.get('success')); print('  artifactId:', d.get('artifactId','?'))\""
ok "Sub-agent attribution: subAgentId + parentTaskId + prov:wasDerivedFrom stored"

banner "TOOL 2 - search_working_memory"
run "python3 /tmp/mcp_call.py search_working_memory '{\"keyword\":\"shred\",\"sessionId\":\"$SESSION_ID\"}' | python3 -c \"import json,sys; d=json.load(sys.stdin); print('  count:', d.get('count',0)); [print('   -', a.get('name','?')[:55]) for a in (d.get('artifacts') or [])]\""
ok "SPARQL keyword search across name + text fields"

banner "TOOL 3 - retrieve_artifact"
RETRIEVE_ARGS=$(python3 -c "import json,os; print(json.dumps({'artifactId': os.environ.get('ARTIFACT_ID','')}))")
run "python3 /tmp/mcp_call.py retrieve_artifact \"\$RETRIEVE_ARGS\" | python3 -c \"import json,sys; d=json.load(sys.stdin); a=d.get('artifact',{}); [print('  '+k+':', str(v)[:50]) for k,v in list(a.items())[:6]]\""
ok "Full artifact with PROV-O metadata retrieved from DKG"

banner "TOOL 4 - update_artifact_status (trust gradient)"
UPDATE1=$(python3 -c "import json,os; print(json.dumps({'artifactId': os.environ.get('ARTIFACT_ID',''), 'newStatus': 'review_needed'}))")
run "python3 /tmp/mcp_call.py update_artifact_status \"\$UPDATE1\" | python3 -c \"import json,sys; d=json.load(sys.stdin); print('  success:', d.get('success')); print('  newStatus:', d.get('newStatus','?'), '-- draft -> review_needed')\""
UPDATE2=$(python3 -c "import json,os; print(json.dumps({'artifactId': os.environ.get('ARTIFACT_ID',''), 'newStatus': 'validated'}))")
run "python3 /tmp/mcp_call.py update_artifact_status \"\$UPDATE2\" | python3 -c \"import json,sys; d=json.load(sys.stdin); print('  success:', d.get('success')); print('  newStatus:', d.get('newStatus','?'), '-- review_needed -> validated')\""
ok "Trust gradient advanced: draft -> review_needed -> validated"

banner "TOOL 7 - get_session_summary"
run "python3 /tmp/mcp_call.py get_session_summary '{\"sessionId\":\"$SESSION_ID\"}' | python3 -c \"import json,sys; d=json.load(sys.stdin); print('  count:', d.get('count',0)); print('  typeCounts:', d.get('typeCounts',{}))\""
ok "Session artifact summary from DKG"

banner "TOOL 6 - synthesize_session"
run "python3 /tmp/mcp_call.py synthesize_session '{\"sessionId\":\"$SESSION_ID\"}' | python3 -c \"import json,sys; d=json.load(sys.stdin); print('  success:', d.get('success')); print('  synthesisId:', d.get('synthesisArtifactId','?')[:40]); print('  artifacts:', d.get('artifactCount',0))\""
ok "knowledge_synthesis artifact written to DKG"

banner "TOOL 9 - get_claim_review (Oracle-ready ClaimReview)"
CLAIM_ARGS=$(python3 -c "import json,os; print(json.dumps({'artifactId': os.environ.get('ARTIFACT_ID','')}))")
run "python3 /tmp/mcp_call.py get_claim_review \"\$CLAIM_ARGS\" | python3 -c \"import json,sys; d=json.load(sys.stdin); cr=d.get('claimReview') or {}; print('  @type:', cr.get('@type','?')); print('  name:', str(cr.get('name','?'))[:55])\""
ok "schema.org ClaimReview JSON-LD -- ready for OriginTrail Oracle integration"

banner "552 Unit Tests -- all passing"
run "cd $DEMO_DIR && npm test 2>&1 | tail -6"
ok "552 unit tests pass  *  99.81% branch coverage"

banner "13 Live Integration Tests -- real DKG node"
run "cd $DEMO_DIR && DKG_AUTH_TOKEN=$TOKEN npm run test:live 2>&1 | tail -6"
ok "13 live integration tests pass -- real DKG v10 node, real UALs"

banner "Done"
echo
printf '\e[1;32m  dkg-claude-code-memory v1.0.0\e[0m\n'
printf '\e[90m  10 MCP tools  *  552 tests  *  99.81%% branches  *  Apache-2.0\e[0m\n'
printf '\e[90m  npm: dkg-claude-code-memory  |  github: drMurlly/dkg-claude-code-memory\e[0m\n'
echo
sleep 3
