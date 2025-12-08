from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from uuid import uuid4

app = FastAPI(title="Judicial Solutions API (Local Mock)")

class Form(BaseModel):
    id: Optional[str] = None
    name: str
    email: str
    phone: str
    country_code: str
    message: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

FORMS_DB: List[Form] = []

@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}

@app.get("/forms")
def list_forms():
    return {"items": FORMS_DB}

@app.post("/forms")
def create_form(form: Form):
    now = datetime.utcnow().isoformat()
    form.id = str(uuid4())
    form.created_at = now
    form.updated_at = now
    FORMS_DB.append(form)
    return {"message": "form_created", "form": form}

@app.get("/forms/{form_id}")
def get_form(form_id: str):
    for f in FORMS_DB:
        if f.id == form_id:
            return f
    return {"error": "not_found"}

@app.delete("/forms/{form_id}")
def delete_form(form_id: str):
    global FORMS_DB
    before = len(FORMS_DB)
    FORMS_DB = [f for f in FORMS_DB if f.id != form_id]
    if len(FORMS_DB) < before:
        return {"message": "deleted"}
    return {"error": "not_found"}