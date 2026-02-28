import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods

from .models import ContactSubmission


# ── Helpers ───────────────────────────────────────────────────────────────────

def _validate_payload(data: dict) -> dict:
    """Return a dict of field -> error string for any invalid fields."""
    errors = {}

    if not data.get('firstName', '').strip():
        errors['firstName'] = 'First name is required.'

    if not data.get('lastName', '').strip():
        errors['lastName'] = 'Last name is required.'

    email = data.get('email', '').strip()
    if not email:
        errors['email'] = 'Email address is required.'
    elif '@' not in email or '.' not in email.split('@')[-1]:
        errors['email'] = 'Please enter a valid email address.'

    if not data.get('subject', '').strip():
        errors['subject'] = 'Please select a topic.'

    if len(data.get('message', '').strip()) < 10:
        errors['message'] = 'Message must be at least 10 characters.'

    return errors


# ── Views ─────────────────────────────────────────────────────────────────────

@require_http_methods(['GET', 'POST'])
def index(request):
    """
    GET  → render demo/templates/demo_site.html
    POST → validate JSON body, save to SQLite3, return JSON response
    """
    if request.method == 'GET':
        return render(request, 'demo_site.html')

    # Parse JSON body sent by fetch() in the template
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse(
            {'ok': False, 'errors': {'__all__': 'Invalid request format.'}},
            status=400,
        )

    errors = _validate_payload(data)
    if errors:
        return JsonResponse({'ok': False, 'errors': errors}, status=422)

    # Save to SQLite3 via Django ORM
    submission = ContactSubmission.objects.create(
        first_name=data['firstName'].strip(),
        last_name=data['lastName'].strip(),
        email=data['email'].strip().lower(),
        subject=data['subject'].strip(),
        message=data['message'].strip(),
    )

    return JsonResponse(
        {
            'ok': True,
            'id': submission.pk,
            'message': 'Thank you! We will be in touch within 24 hours.',
        },
        status=201,
    )


def submissions(request):
    """
    Read-only list of all contact submissions returned as JSON.
    Endpoint: GET /submissions/
    Tip: wrap with @login_required in production.
    """
    qs = ContactSubmission.objects.values(
        'id', 'first_name', 'last_name',
        'email', 'subject', 'message', 'submitted_at',
    )
    rows = list(qs)
    for row in rows:
        row['submitted_at'] = row['submitted_at'].isoformat()

    return JsonResponse({'ok': True, 'count': len(rows), 'results': rows})
