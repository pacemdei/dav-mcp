import ICAL from 'ical.js';
import { updateFields } from 'tsdav-utils';

/**
 * RFC 5545 properties whose value is a comma-separated LIST of TEXT values.
 *
 * These cannot go through tsdav-utils' updateFields(): it calls ical.js
 * updatePropertyWithValue(name, value), which treats the value as a single TEXT
 * and therefore escapes every comma (RFC 5545 3.3.11). The result is one value
 * named "research,p-urbanair" instead of two values, so no client can filter on
 * either tag.
 *
 * See RFC 5545 3.8.1.2 (CATEGORIES), 3.8.1.10 (RESOURCES), 3.8.4.5 (RELATED-TO).
 */
export const LIST_VALUED_PROPERTIES = new Set([
  'CATEGORIES',
  'RESOURCES',
  'RELATED-TO',
]);

/**
 * Accepts an array of strings or a comma-separated string and returns a clean
 * list of values. Empty entries are dropped, so "a,,b" and ["a", "b"] agree.
 */
export function normalizeListValue(value) {
  const parts = Array.isArray(value) ? value : String(value).split(',');
  return parts.map((part) => String(part).trim()).filter((part) => part.length > 0);
}

/**
 * Drop-in replacement for tsdav-utils' updateFields that understands arrays for
 * list-valued properties.
 *
 * Single-valued properties are handed to updateFields unchanged, so all of its
 * behaviour (date handling, TEXT escaping) is preserved. List-valued properties
 * are written afterwards with ICAL.Property.setValues(), which emits a real
 * list. A list item that itself contains a comma is still escaped, because the
 * escaping then happens per item rather than across the whole value.
 */
export function updateFieldsWithLists(calendarObject, fields = {}) {
  const listFields = {};
  const plainFields = {};

  for (const [key, value] of Object.entries(fields)) {
    if (LIST_VALUED_PROPERTIES.has(key.toUpperCase())) {
      listFields[key] = value;
    } else {
      plainFields[key] = value;
    }
  }

  const updatedData = updateFields(calendarObject, plainFields);

  if (Object.keys(listFields).length === 0) {
    return updatedData;
  }

  const root = new ICAL.Component(ICAL.parse(updatedData));
  const component = root.name === 'vcalendar'
    ? root.getFirstSubcomponent('vevent') ||
      root.getFirstSubcomponent('vtodo') ||
      root.getFirstSubcomponent('vjournal')
    : root;

  if (!component) {
    throw new Error('No VEVENT, VTODO, or VJOURNAL found in VCALENDAR');
  }

  for (const [key, value] of Object.entries(listFields)) {
    const name = key.toLowerCase();
    const values = normalizeListValue(value);

    component.removeAllProperties(name);

    if (values.length === 0) {
      continue;
    }

    const property = new ICAL.Property(name, component);
    property.setValues(values);
    component.addProperty(property);
  }

  return root.toString();
}
