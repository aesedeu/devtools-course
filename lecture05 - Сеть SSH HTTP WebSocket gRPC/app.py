from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()
state = {"value": 0}


class Body(BaseModel):
    value: int


@app.get("/value")
def read_value():
    return state


@app.post("/value")
def write_value(body: Body):
    state["value"] = body.value
    return state
