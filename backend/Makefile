PYTHON ?= python

.PHONY: check fix typecheck lint format format-check security deps-audit deadcode

check:
	$(PYTHON) -m ruff check app tests
	$(PYTHON) -m ruff format --check app tests
	$(PYTHON) -m mypy app --ignore-missing-imports --no-strict-optional
	$(PYTHON) -m bandit -r app -x tests
	$(PYTHON) -m pip_audit
	$(PYTHON) -m vulture app --min-confidence 80

fix:
	$(PYTHON) -m ruff check app tests --fix
	$(PYTHON) -m ruff format app tests

typecheck:
	$(PYTHON) -m mypy app --ignore-missing-imports --no-strict-optional

lint:
	$(PYTHON) -m ruff check app tests

format:
	$(PYTHON) -m ruff format app tests

format-check:
	$(PYTHON) -m ruff format --check app tests

security:
	$(PYTHON) -m bandit -r app -x tests

deps-audit:
	$(PYTHON) -m pip_audit

deadcode:
	$(PYTHON) -m vulture app --min-confidence 80
