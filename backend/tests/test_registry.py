from types import SimpleNamespace

from app.worker.registry import RdapBootstrapRegistry, build_domain_rdap_url


def test_resolves_rdap_base_url_from_bootstrap():
    registry = RdapBootstrapRegistry.from_payload(
        {
            "services": [
                [["com", "net"], ["https://rdap.verisign.com/com/v1/"]],
            ],
        }
    )

    assert registry.resolve("example.com") == "https://rdap.verisign.com/com/v1/"
    assert build_domain_rdap_url("example.com", registry=registry) == (
        "https://rdap.verisign.com/com/v1/domain/example.com"
    )


def test_fr_uses_configured_domain_endpoint_override():
    registry = RdapBootstrapRegistry.from_payload({"services": []}, fr_base_url="https://rdap.nic.fr/domain/")

    assert registry.resolve("example.fr") == "https://rdap.nic.fr/domain/"
    assert build_domain_rdap_url("example.fr", registry=registry) == "https://rdap.nic.fr/domain/example.fr"


def test_build_domain_rdap_url_uses_settings_for_fr_override():
    settings = SimpleNamespace(rdap_base_url="https://rdap.nic.fr/domain/")
    registry = RdapBootstrapRegistry.from_payload({"services": []})

    assert build_domain_rdap_url("example.fr", settings=settings, registry=registry) == (
        "https://rdap.nic.fr/domain/example.fr"
    )
