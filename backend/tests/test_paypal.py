import asyncio

import httpx
import pytest

from app.paypal import PayPalSandboxError, PayPalSandboxGateway


def test_connectivity_and_fixed_price_order():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        assert request.url.host == "api-m.sandbox.paypal.com"
        if request.url.path == "/v1/oauth2/token":
            assert b"grant_type=client_credentials" in request.content
            return httpx.Response(200, json={"access_token": "fake-sandbox-token"})
        assert request.url.path == "/v2/checkout/orders"
        assert request.headers["Authorization"] == "Bearer fake-sandbox-token"
        assert b'"value":"5.00"' in request.content
        return httpx.Response(
            201,
            json={
                "id": "TEST-ORDER-01",
                "status": "CREATED",
                "links": [{"rel": "approve", "href": "https://www.sandbox.paypal.com/checkoutnow?token=TEST"}],
            },
        )

    client = PayPalSandboxGateway("fake-id", "fake-secret", transport=httpx.MockTransport(handler))
    result = asyncio.run(client.create_demo_order("financial-literacy-demo"))
    assert result.order_id == "TEST-ORDER-01"
    assert result.amount == "5.00"
    assert result.approve_url.startswith("https://www.sandbox.paypal.com/")
    assert len(seen) == 2


def test_rejects_arbitrary_order_item_without_network_call():
    client = PayPalSandboxGateway("fake-id", "fake-secret")
    with pytest.raises(ValueError, match="Unknown demo item"):
        asyncio.run(client.create_demo_order("user-specified-price"))


def test_invalid_sandbox_credentials_have_safe_error_message():
    def handler(_request):
        return httpx.Response(401, json={"debug_id": "do-not-expose", "message": "invalid_client"})

    client = PayPalSandboxGateway("fake-id", "fake-secret", transport=httpx.MockTransport(handler))
    with pytest.raises(PayPalSandboxError) as exc:
        asyncio.run(client.get_access_token())
    assert "do-not-expose" not in str(exc.value)
    assert "invalid_client" not in str(exc.value)
