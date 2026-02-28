from django.contrib import admin
from .models import ContactSubmission


@admin.register(ContactSubmission)
class ContactSubmissionAdmin(admin.ModelAdmin):
    list_display  = ('first_name', 'last_name', 'email', 'subject', 'submitted_at')
    list_filter   = ('subject', 'submitted_at')
    search_fields = ('first_name', 'last_name', 'email', 'message')
    readonly_fields = ('submitted_at',)
    ordering      = ('-submitted_at',)
