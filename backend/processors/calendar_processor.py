import logging

from icalendar import Calendar

logger = logging.getLogger(__name__)


def extract_text(file_bytes: bytes) -> str:
    """
    Parse an .ics calendar file and extract event details as text.
    Produces human-readable text from VEVENT components.
    """
    try:
        cal = Calendar.from_ical(file_bytes)
        events = []
        for component in cal.walk():
            if component.name == "VEVENT":
                parts = []
                summary = component.get("summary")
                if summary:
                    parts.append(f"Event: {summary}")

                dtstart = component.get("dtstart")
                if dtstart:
                    parts.append(f"Start: {dtstart.dt.isoformat()}")

                dtend = component.get("dtend")
                if dtend:
                    parts.append(f"End: {dtend.dt.isoformat()}")

                location = component.get("location")
                if location:
                    parts.append(f"Location: {location}")

                description = component.get("description")
                if description:
                    parts.append(f"Description: {description}")

                if parts:
                    events.append("\n".join(parts))

        return "\n\n---\n\n".join(events) if events else "Empty calendar file"
    except Exception as e:
        logger.error(f"Calendar extraction failed: {e}")
        return ""
