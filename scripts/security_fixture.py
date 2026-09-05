"""Generate the explicit security fixture; never silently skip unsupported cases."""
import json
from pathlib import Path
import sys
from scaffold_app import scaffold, validate_spec

root = Path(__file__).resolve().parent.parent
spec = json.loads((root / "references/example-record-access.app-spec.json").read_text(encoding="utf-8"))
spec["entities"][0]["relationships"] = [{"key": "parent_document", "label": "Documento padre", "type": "belongs_to", "target": "document", "required": False, "on_delete": "restrict"}]
spec["entities"][0]["fields"].append({"key": "due_date", "label": "Vencimiento", "type": "date"})
assert not validate_spec(spec), validate_spec(spec)
if __name__ == "__main__":
    scaffold(spec, Path(sys.argv[1]).resolve())
