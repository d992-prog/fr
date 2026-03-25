from types import SimpleNamespace

from app.worker.checks import DnsSignal, RdapSignal
from app.worker.decision import evaluate_domain


def make_domain(**overrides):
    base = {
        "status": "checking",
        "manual_burst": False,
        "available_confirmations": 0,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_decision_enters_burst_on_first_possible_drop():
    result = evaluate_domain(
        make_domain(),
        dns_signal=DnsSignal.NXDOMAIN,
        rdap_signal=RdapSignal.NOT_FOUND,
        confirmation_threshold=3,
    )

    assert result.status == "checking"
    assert result.check_mode == "burst"
    assert result.confirmations == 1


def test_decision_confirms_availability_after_threshold():
    result = evaluate_domain(
        make_domain(available_confirmations=2),
        dns_signal=DnsSignal.NXDOMAIN,
        rdap_signal=RdapSignal.NOT_FOUND,
        confirmation_threshold=3,
    )

    assert result.status == "available"
    assert result.should_alert is True


def test_decision_respects_manual_burst_when_domain_is_registered():
    result = evaluate_domain(
        make_domain(manual_burst=True),
        dns_signal=DnsSignal.EXISTS,
        rdap_signal=RdapSignal.FOUND,
        confirmation_threshold=3,
    )

    assert result.status == "checking"
    assert result.check_mode == "burst"
