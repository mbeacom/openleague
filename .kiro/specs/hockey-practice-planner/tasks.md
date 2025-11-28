# Implementation Plan

- [x] 1. Set up database schema and migrations

  - Create Prisma schema models for PracticeSession, Play, and PracticeSessionPlay
  - Generate and apply database migration
  - Update User and Team models with new relations
  - _Requirements: 1.5, 2.1, 4.1_

- [x] 2. Create TypeScript type definitions

  - Define PlayData, PlayerIcon, DrawingElement, and TextAnnotation interfaces in types directory
  - Define PracticeSessionData and PlayInSession interfaces
  - Define DrawingTool and SavedPlay types
  - Create validation schemas for play data JSON structure
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1, 5.2_

- [x] 3. Implement canvas utility functions

  - [x] 3.1 Create rink rendering utilities

    - Write function to draw hockey rink with standard dimensions and markings
    - Implement coordinate transformation utilities for responsive scaling
    - Create layer caching system for rink background
    - _Requirements: 1.1_

  - [x] 3.2 Implement drawing utilities

    - Write functions for drawing lines, curves, and arrows with directional indicators
    - Implement player icon rendering with labels and colors
    - Create text annotation rendering functions
    - _Requirements: 1.2, 1.3, 1.4, 5.1, 5.2_

  - [x] 3.3 Create interaction utilities

    - Implement hit detection for selecting elements on canvas
    - Write touch and mouse event handlers with coordinate mapping
    - Create undo/redo history management system
    - _Requirements: 5.4, 5.5_

  - [x] 3.4 Implement thumbnail generation
    - Write function to export canvas as base64 PNG
    - Create thumbnail scaling and optimization utilities
    - _Requirements: 4.2_

- [x] 4. Build RinkBoard component

  - [x] 4.1 Create base canvas component

    - Implement canvas initialization with responsive sizing
    - Set up rendering loop with requestAnimationFrame
    - Add rink background rendering
    - _Requirements: 1.1_

  - [x] 4.2 Add drawing tool interactions

    - Implement player icon placement tool
    - Create line and curve drawing tools with arrow indicators
    - Add text annotation tool with positioning
    - Implement eraser tool for removing elements
    - _Requirements: 1.2, 1.3, 1.4, 5.1, 5.2, 5.4_

  - [x] 4.3 Implement selection and editing

    - Add element selection with visual feedback
    - Enable drag-and-drop for moving elements
    - Implement element deletion
    - _Requirements: 5.4_

  - [x] 4.4 Add undo/redo functionality

    - Integrate history management with component state
    - Add keyboard shortcuts for undo/redo
    - _Requirements: 5.5_

  - [x] 4.5 Implement mobile touch support
    - Add touch event handlers for drawing and selection
    - Implement pinch-to-zoom functionality
    - Add pan gesture support
    - _Requirements: 3.5_

- [x] 5. Create DrawingToolbar component

  - Implement tool selection buttons with active state
  - Add color picker for drawing colors
  - Create undo/redo buttons with disabled states
  - Add clear canvas button with confirmation
  - Implement responsive layout for mobile
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 6. Build PlayEditor component

  - [ ] 6.1 Create play editor layout

    - Integrate RinkBoard component in edit mode
    - Add DrawingToolbar component
    - Create play metadata form (name, description)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ] 6.2 Implement save functionality

    - Add save button with loading state
    - Implement auto-save with debouncing
    - Generate thumbnail on save
    - Show save status feedback
    - _Requirements: 1.5, 4.1_

  - [ ] 6.3 Add save to library option
    - Create checkbox to mark play as template
    - Implement save to library action
    - _Requirements: 4.1_

- [ ] 7. Implement server actions for plays

  - [ ] 7.1 Create play CRUD actions

    - Write createPlay server action with validation
    - Implement updatePlay server action
    - Create deletePlay server action with cascade handling
    - Add getPlayById and getPlaysByTeam query actions
    - _Requirements: 1.5, 4.1, 4.5_

  - [ ] 7.2 Add permission checks

    - Verify team admin role for create/edit/delete operations
    - Verify team membership for read operations
    - Prevent cross-team data access
    - _Requirements: 1.5, 4.1_

  - [ ] 7.3 Implement validation
    - Validate PlayData JSON structure
    - Sanitize text inputs (name, description, annotations)
    - Enforce element count limits (max 100 per play)
    - Validate annotation text length (max 500 characters)
    - _Requirements: 1.5_

- [ ] 8. Build PlayLibrary component

  - [ ] 8.1 Create library grid layout

    - Implement responsive grid for play thumbnails
    - Add play card with thumbnail, name, and description
    - Create empty state for no plays
    - _Requirements: 4.2_

  - [ ] 8.2 Add play selection

    - Implement click handler to select play
    - Show selected state on play card
    - Emit onSelectPlay event with play data
    - _Requirements: 4.3_

  - [ ] 8.3 Implement play management

    - Add delete button with confirmation dialog
    - Create edit button to open play in editor
    - Show play metadata (created date, last updated)
    - _Requirements: 4.5_

  - [ ] 8.4 Add search and filtering
    - Implement search input for play names
    - Add filter by creation date
    - Create pagination for large libraries (20 per page)
    - _Requirements: 4.2_

- [ ] 9. Create PracticeSessionEditor component

  - [ ] 9.1 Build session metadata form

    - Create form fields for title, date, and duration
    - Add form validation for required fields
    - Implement duration validation (1-300 minutes)
    - _Requirements: 2.1_

  - [ ] 9.2 Implement play list management

    - Create list view for plays in session
    - Add play card showing thumbnail, duration, and instructions
    - Display total session time with validation
    - Show warning when total exceeds session duration
    - _Requirements: 2.2, 2.3_

  - [ ] 9.3 Add play addition from library

    - Integrate PlayLibrary component in selection mode
    - Implement add play button to open library
    - Create copy of library play when adding to session
    - Assign sequence number automatically
    - _Requirements: 2.2, 4.3, 4.4_

  - [ ] 9.4 Implement play reordering

    - Add drag-and-drop for reordering plays
    - Update sequence numbers on reorder
    - Maintain play data integrity during reorder
    - _Requirements: 2.5_

  - [ ] 9.5 Add play editing in session

    - Create inline editor for play instructions
    - Add duration input for each play
    - Implement edit play button to open PlayEditor
    - Ensure edits don't affect library play
    - _Requirements: 2.4, 4.4_

  - [ ] 9.6 Implement session save and share
    - Add save button with loading state
    - Create share button with confirmation
    - Show shared status indicator
    - Implement auto-save for session metadata
    - _Requirements: 2.1, 3.1_

- [ ] 10. Implement server actions for practice sessions

  - [ ] 10.1 Create session CRUD actions

    - Write createPracticeSession server action
    - Implement updatePracticeSession server action
    - Create deletePracticeSession server action
    - Add getPracticeSessionById query action
    - Implement getPracticeSessionsByTeam query action
    - _Requirements: 2.1, 2.2, 2.5_

  - [ ] 10.2 Implement session sharing action

    - Create sharePracticeSession server action
    - Update isShared flag in database
    - Trigger notification sending
    - _Requirements: 3.1_

  - [ ] 10.3 Add permission checks

    - Verify team admin role for create/edit/delete/share operations
    - Verify team membership for view operations
    - Prevent cross-team session access
    - _Requirements: 3.1, 3.2_

  - [ ] 10.4 Implement validation
    - Validate session metadata (title, date, duration)
    - Validate play sequence integrity
    - Validate total duration against session duration
    - Sanitize all text inputs
    - _Requirements: 2.1, 2.3_

- [ ] 11. Create practice session view page

  - [ ] 11.1 Build session detail layout

    - Create page at /dashboard/team/[teamId]/practice-planner/[sessionId]
    - Display session metadata (title, date, duration)
    - Show list of plays in sequence
    - Add back navigation to practice planner list
    - _Requirements: 3.2, 3.3_

  - [ ] 11.2 Implement play viewer

    - Integrate RinkBoard component in view mode
    - Display play instructions and duration
    - Add navigation between plays (previous/next)
    - _Requirements: 3.3_

  - [ ] 11.3 Add mobile optimization

    - Implement responsive layout for mobile devices
    - Optimize canvas rendering for smaller screens
    - Add touch-friendly navigation controls
    - _Requirements: 3.5_

  - [ ] 11.4 Add edit mode for admins
    - Show edit button for team admins
    - Link to PracticeSessionEditor component
    - Hide edit controls for regular members
    - _Requirements: 3.4_

- [ ] 12. Create practice planner list page

  - [ ] 12.1 Build session list layout

    - Create page at /dashboard/team/[teamId]/practice-planner
    - Display list of practice sessions sorted by date
    - Show session cards with title, date, and play count
    - Add create new session button for admins
    - _Requirements: 2.1_

  - [ ] 12.2 Implement filtering and sorting

    - Add filter by date range
    - Add filter by shared status
    - Implement sort by date (ascending/descending)
    - _Requirements: 2.1_

  - [ ] 12.3 Add session actions
    - Show edit and delete buttons for admins
    - Implement delete with confirmation dialog
    - Add share/unshare toggle for admins
    - _Requirements: 2.1, 3.1_

- [ ] 13. Implement notification system integration

  - [ ] 13.1 Create email template for practice plans

    - Design email template with session details
    - Include direct link to view session
    - Add play count and session duration
    - Show practice date and time
    - _Requirements: 6.2_

  - [ ] 13.2 Implement notification sending

    - Create function to send practice plan notifications
    - Query team members for notification recipients
    - Respect notification preferences
    - Send emails via existing Mailchimp integration
    - _Requirements: 6.1, 6.4_

  - [ ] 13.3 Add update notifications

    - Detect session updates after sharing
    - Send update notification to team members
    - Include summary of changes in email
    - _Requirements: 6.3_

  - [ ] 13.4 Add notification preference
    - Update NotificationPreference model with practicePlanNotifications field
    - Create migration for new preference
    - Add toggle in user notification settings
    - _Requirements: 6.4_

- [ ] 14. Add navigation integration

  - Add practice planner link to team dashboard navigation
  - Create breadcrumb navigation for practice planner pages
  - Add upcoming practice plans widget to team dashboard
  - Integrate practice sessions into team calendar view
  - _Requirements: 3.2_

- [ ] 15. Implement error handling and validation

  - [ ] 15.1 Add client-side error handling

    - Implement canvas rendering error fallback
    - Add auto-save failure warning with retry
    - Create validation error display for forms
    - _Requirements: 1.5, 2.1_

  - [ ] 15.2 Add server-side error handling
    - Implement permission error responses (403)
    - Add validation error responses (400)
    - Create database error handling (500)
    - Log notification failures without blocking
    - _Requirements: 1.5, 2.1, 3.1_

- [ ]\* 16. Write component tests

  - [ ]\* 16.1 Test RinkBoard component

    - Test rendering in edit and view modes
    - Test tool interactions (drawing, selecting, erasing)
    - Test mobile touch events
    - Test undo/redo functionality
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.4, 5.5_

  - [ ]\* 16.2 Test PracticeSessionEditor component

    - Test adding and removing plays
    - Test reordering plays
    - Test duration validation
    - Test save and share actions
    - _Requirements: 2.2, 2.3, 2.5, 3.1_

  - [ ]\* 16.3 Test PlayLibrary component
    - Test play selection
    - Test search and filtering
    - Test play deletion with confirmation
    - _Requirements: 4.2, 4.3, 4.5_

- [ ]\* 17. Write integration tests

  - [ ]\* 17.1 Test practice session workflow

    - Test create session → add plays → share → view as member
    - Test edit shared session → verify updates propagate
    - Test delete session → verify cascade deletes
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.4_

  - [ ]\* 17.2 Test play library workflow

    - Test save play to library → add to session → edit in session
    - Verify original library play unchanged after session edit
    - Test delete library play → verify sessions retain copy
    - _Requirements: 4.1, 4.3, 4.4, 4.5_

  - [ ]\* 17.3 Test notification workflow
    - Test share session → verify emails sent to team members
    - Test update shared session → verify update notifications
    - Test notification preferences are respected
    - _Requirements: 6.1, 6.3, 6.4_

- [ ]\* 18. Write unit tests

  - [ ]\* 18.1 Test canvas utilities

    - Test coordinate transformations
    - Test drawing element creation
    - Test collision detection for selection
    - _Requirements: 1.1, 1.2, 5.4_

  - [ ]\* 18.2 Test data validation

    - Test PlayData JSON schema validation
    - Test session duration calculations
    - Test play sequence ordering
    - _Requirements: 1.5, 2.3, 2.5_

  - [ ]\* 18.3 Test permission checks
    - Test admin-only access to edit functions
    - Test team member view access
    - Test cross-team access prevention
    - _Requirements: 3.1, 3.2_
