"""Stage 1: PayPal sandbox connectivity and controlled test-order creation.

This deliberately does NOT implement payment capture, real-money transfers, or AI.
All PayPal operations are sandbox-only and require a server-side demo access key.
"""

from __future__ import annotations

import os
import secrets
from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from .paypal import PayPalSandboxError, PayPalSandboxGateway

app = FastAPI(title="VoiceBridge AI Pay — Sandbox Backend", version="0.1.0")


class DemoOrderRequest(BaseModel):
    item_code: Literal["financial-literacy-demo"]


def sandbox_gateway(x_demo_key: str | None = Header(default=None)) -> PayPalSandboxGateway:
    configured_key = os.getenv("DEMO_ACCESS_KEY", "")
    client_id = os.getenv("PAYPAL_CLIENT_ID", "")
    client_secret = os.getenv("PAYPAL_CLIENT_SECRET", "")
    if not (configured_key and client_id and client_secret):
        raise HTTPException(status_code=503, detail="Sandbox is not configured")
    if not x_demo_key or not secrets.compare_digest(configured_key, x_demo_key):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return PayPalSandboxGateway(client_id, client_secret)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": "sandbox", "release": "stage-1"}


@app.get("/api/paypal/connectivity")
async def connectivity(gateway: PayPalSandboxGateway = Depends(sandbox_gateway)) -> dict[str, object]:
    try:
        await gateway.get_access_token()
    except PayPalSandboxError:
        raise HTTPException(status_code=502, detail="Sandbox authentication failed") from None
    return {"sandbox": True, "credentials_valid": True}


@app.post("/api/paypal/orders", status_code=201)
async def create_order(
    order: DemoOrderRequest,
    gateway: PayPalSandboxGateway = Depends(sandbox_gateway),
) -> dict[str, str | None]:
    try:
        result = await gateway.create_demo_order(order.item_code)
    except PayPalSandboxError:
        raise HTTPException(status_code=502, detail="Sandbox order creation failed") from None
    return {
        "order_id": result.order_id,
        "status": result.status,
        "approve_url": result.approve_url,
        "currency": result.currency,
        "amount": result.amount,
    }
