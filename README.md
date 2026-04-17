# Floating Daily To-Do

A floating sidebar Chrome extension for daily task tracking.

## Installation

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the project folder.

The sidebar will appear automatically on every page.

## Usage

Drag the tab on the edge of the browser to reposition the panel. It snaps to any of the four sides and remembers its position.

## Features

**Tasks**
- Add tasks with an optional tag (work / life / learn)
- Click a task to cycle through three statuses: Pending → In Progress → Done
- Double-click a task title or sub-task to edit it inline
- Click a tag badge to cycle through tags without opening the task
- Set a due date by clicking the date badge — overdue items are highlighted in red; today and tomorrow are labelled accordingly
- Task titles support inline Markdown — links, bold, italic, code, strikethrough
- Expand any task to add notes (Markdown supported, with a Preview toggle) and sub-tasks
- Sub-tasks support the same three-state status cycle as top-level tasks
- Drag tasks to reorder, nest under another task (middle drop zone), or drag sub-tasks back out to the top level

**Right-click to capture**
- Right-click anywhere on a page and choose **Add to Floating To-Do**
- Creates a task with the page title as a clickable Markdown link `[title](url)`
- If text is selected, it is saved as a blockquote note on the task

**Interface**
- Light and dark mode
- Pin the panel open so it does not close on mouse-out
- Progress bar showing completed vs total tasks
- Clear all completed tasks in one click (cleared tasks are archived for 14 days)

**Weekly wrap-up**
- Open via the **⋯** menu → **Weekly wrap-up**
- Shows completed, in-progress, pending, and carried-over tasks for the current week
- Includes a **Removed this week** section for tasks that were cleared or deleted during the week, so the summary is always complete
- Copy the Markdown to clipboard with one click

**Backup & restore**
- **⋯ → Backup to JSON** — opens a Save dialog (File System Access API) so you can choose exactly where to save `ftd-backup.json`
- The backup includes all current tasks plus a 14-day archive of recently deleted/cleared tasks
- **⋯ → Restore backup** — opens an Open dialog to load a previous backup; supports both current and older backup formats
