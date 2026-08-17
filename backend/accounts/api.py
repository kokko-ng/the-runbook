"""Account endpoints.

An account does one thing: sync a save between devices. It is never required to
play, so every failure here is recoverable by simply carrying on offline.

Authentication is Django's own session auth over same-origin requests, which
means CSRF applies to every state-changing call. The client fetches a token from
/api/auth/csrf and sends it back as X-CSRFToken.
"""

from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError
from django.middleware.csrf import get_token
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from ninja import Router, Schema, Status
from ninja.errors import HttpError
from ninja.security import django_auth
from pydantic import EmailStr

User = get_user_model()

router = Router(tags=["auth"])


class CredentialsIn(Schema):
    email: EmailStr
    password: str


class EmailIn(Schema):
    email: EmailStr


class ResetConfirmIn(Schema):
    uid: str
    token: str
    password: str


class UserOut(Schema):
    email: str


class CsrfOut(Schema):
    csrf_token: str


@router.get("/csrf", response=CsrfOut)
def csrf(request):
    """Sets the CSRF cookie and returns the token for the SPA's request header."""
    return {"csrf_token": get_token(request)}


@router.get("/me", response={200: UserOut, 401: dict})
def me(request):
    if not request.user.is_authenticated:
        return Status(401, {"detail": "Not signed in."})
    return Status(200, {"email": request.user.email})


@router.post("/signup", response={200: UserOut})
def signup(request, data: CredentialsIn):
    email = data.email.lower().strip()

    if User.objects.filter(email__iexact=email).exists():
        raise HttpError(409, "An account with that email already exists.")

    try:
        validate_password(data.password)
    except ValidationError as exc:
        raise HttpError(400, " ".join(exc.messages)) from exc

    user = User.objects.create_user(email=email, password=data.password)
    login(request, user)
    return Status(200, {"email": user.email})


@router.post("/login", response={200: UserOut})
def login_view(request, data: CredentialsIn):
    user = authenticate(request, username=data.email.lower().strip(), password=data.password)
    if user is None:
        # One message for both cases, so the endpoint cannot be used to discover
        # which email addresses have accounts.
        raise HttpError(401, "That email and password do not match an account.")

    login(request, user)
    return Status(200, {"email": user.email})


@router.post("/logout", response={204: None}, auth=django_auth)
def logout_view(request):
    logout(request)
    return Status(204, None)


@router.post("/password-reset", response={202: dict})
def password_reset(request, data: EmailIn):
    """Always reports success: whether an address has an account is not public."""
    form = PasswordResetForm({"email": data.email})
    if form.is_valid():
        form.save(
            request=request,
            use_https=request.is_secure(),
            from_email=None,
            email_template_name="registration/password_reset_email.txt",
            subject_template_name="registration/password_reset_subject.txt",
        )
    return Status(202, {"detail": "If that email has an account, a reset link is on its way."})


@router.post("/password-reset/confirm", response={200: dict})
def password_reset_confirm(request, data: ResetConfirmIn):
    try:
        user = User.objects.get(pk=force_str(urlsafe_base64_decode(data.uid)))
    except (User.DoesNotExist, ValueError, TypeError, OverflowError) as exc:
        raise HttpError(400, "That reset link is not valid.") from exc

    if not default_token_generator.check_token(user, data.token):
        raise HttpError(400, "That reset link has expired or has already been used.")

    try:
        validate_password(data.password, user)
    except ValidationError as exc:
        raise HttpError(400, " ".join(exc.messages)) from exc

    user.set_password(data.password)
    user.save(update_fields=["password"])
    return Status(200, {"detail": "Password changed. You can sign in now."})


def reset_link_parts(user) -> tuple[str, str]:
    """uid and token for a reset link. Used by the email template and by tests."""
    return urlsafe_base64_encode(force_bytes(user.pk)), default_token_generator.make_token(user)
