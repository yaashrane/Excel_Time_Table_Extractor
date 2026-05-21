"""Run once to create a local test account. Delete after use."""
import auth_store

EMAIL = "test@local.com"
PASSWORD = "test1234"
NAME = "Test User"

if auth_store.user_exists(EMAIL):
    print(f"User already exists: {EMAIL}")
else:
    auth_store.create_user(EMAIL, NAME, PASSWORD)
    print(f"Created user: {EMAIL} / {PASSWORD}")
