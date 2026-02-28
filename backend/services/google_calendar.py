import os
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

from google.oauth2 import service_account
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

SCOPES = ['https://www.googleapis.com/auth/calendar']

def get_calendar_service():
    """Builds and returns the Google Calendar service, or None if not configured."""
    creds_str = os.getenv('GOOGLE_CALENDAR_CREDENTIALS_JSON')
    if not creds_str:
        return None
    
    try:
        creds_info = json.loads(creds_str)
        creds = service_account.Credentials.from_service_account_info(
            creds_info, scopes=SCOPES
        )
        service = build('calendar', 'v3', credentials=creds)
        return service
    except Exception as e:
        logger.error(f"Failed to initialize Google Calendar service: {e}")
        return None

def build_event_body(order_data: dict) -> dict:
    order_id = order_data.get('id', 'Unknown')
    customer_name = order_data.get('customerName', 'Walk-in')
    phone = order_data.get('customerPhone', '')
    address = order_data.get('address', '')
    items = order_data.get('items', [])
    status = order_data.get('status', 'PENDING')
    due_time_str = order_data.get('dueTime')

    # Construct the description showing items
    items_list = [f"- {i.get('name', 'Item')} x{i.get('quantity', 1)}" for i in items]
    items_str = "\n".join(items_list)
    description = f"Status: {status}\nPhone: {phone}\nAddress: {address}\n\nItems:\n{items_str}"

    if not due_time_str:
        start_dt = datetime.utcnow()
    else:
        # ISO format like 2026-02-27T12:00:00.000Z
        try:
            start_dt = datetime.fromisoformat(due_time_str.replace('Z', '+00:00').split('.')[0])
        except Exception:
            start_dt = datetime.utcnow()
            
    end_dt = start_dt + timedelta(minutes=30)  # Default 30 min duration

    return {
        'summary': f"[{order_id}] Order - {customer_name}",
        'location': address,
        'description': description,
        'start': {
            'dateTime': start_dt.isoformat() + 'Z',
            'timeZone': 'UTC',
        },
        'end': {
            'dateTime': end_dt.isoformat() + 'Z',
            'timeZone': 'UTC',
        },
    }

def sync_order_to_calendar(order_data: dict, calendar_event_id: Optional[str] = None) -> Optional[str]:
    """
    Creates or updates a Google Calendar event for the given order.
    Returns the calendar event ID if successful, or the existing one on failure.
    """
    service = get_calendar_service()
    calendar_id = os.getenv('GOOGLE_CALENDAR_ID')
    if not service or not calendar_id:
        return calendar_event_id

    try:
        event_body = build_event_body(order_data)

        if calendar_event_id:
            # Update existing event
            updated_event = service.events().update(
                calendarId=calendar_id, 
                eventId=calendar_event_id, 
                body=event_body
            ).execute()
            return updated_event.get('id')
        else:
            # Create new event
            created_event = service.events().insert(
                calendarId=calendar_id, 
                body=event_body
            ).execute()
            return created_event.get('id')

    except Exception as e:
        logger.error(f"Error syncing order {order_data.get('id')} to calendar: {e}")
        return calendar_event_id

def delete_calendar_event(calendar_event_id: str):
    """
    Deletes the calendar event if it exists.
    """
    if not calendar_event_id:
        return
        
    service = get_calendar_service()
    calendar_id = os.getenv('GOOGLE_CALENDAR_ID')
    if not service or not calendar_id:
        return

    try:
        service.events().delete(
            calendarId=calendar_id, 
            eventId=calendar_event_id
        ).execute()
    except Exception as e:
        logger.error(f"Error deleting calendar event {calendar_event_id}: {e}")
