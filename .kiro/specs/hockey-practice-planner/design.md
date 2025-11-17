# Design Document: Hockey Practice Planner

## Overview

The Hockey Practice Planner is a visual planning tool that enables coaches to design practice sessions using an interactive rink board, create reusable plays, and share practice plans with team members. The feature integrates with the existing openleague team management system and leverages the current notification infrastructure.

### Key Design Principles

- **Canvas-based rendering**: Use HTML5 Canvas for the rink board to enable smooth drawing and manipulation
- **Mobile-first**: Ensure touch interactions work seamlessly on mobile devices
- **Incremental saves**: Auto-save play and session data to prevent data loss
- **Permission-based access**: Only team admins can create/edit; all team members can view
- **Reusability**: Build a play library system for coaches to reuse drills across sessions

## Architecture

### High-Level Component Structure

```
┌─────────────────────────────────────────────────────────┐
│                    Dashboard Routes                      │
│  /dashboard/team/[teamId]/practice-planner              │
│  /dashboard/team/[teamId]/practice-planner/[sessionId]  │
│  /dashboard/team/[teamId]/practice-planner/library      │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Practice Planner Components                 │
│  - PracticeSessionEditor                                │
│  - RinkBoard (Canvas-based)                             │
│  - PlayEditor                                           │
│  - PlayLibrary                                          │
│  - DrawingToolbar                                       │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│              Server Actions & API                        │
│  - createPracticeSession()                              │
│  - updatePracticeSession()                              │
│  - sharePracticeSession()                               │
│  - createPlay()                                         │
│  - updatePlay()                                         │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                  Database Layer                          │
│  - PracticeSession                                      │
│  - Play                                                 │
│  - PlayElement (drawings, players, annotations)         │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Frontend**: React 19 with Next.js 14 App Router
- **Canvas Rendering**: HTML5 Canvas API with custom drawing utilities
- **State Management**: React hooks with local state for canvas interactions
- **Backend**: Next.js Server Actions for mutations
- **Database**: PostgreSQL via Prisma ORM
- **Notifications**: Existing email notification system (Mailchimp Transactional)

## Components and Interfaces

### 1. RinkBoard Component

The core canvas-based component for visualizing and editing plays.

**Props Interface:**

```typescript
interface RinkBoardProps {
  mode: "edit" | "view";
  playData: PlayData;
  onPlayDataChange?: (data: PlayData) => void;
  selectedTool?: DrawingTool;
  selectedColor?: string;
  width?: number;
  height?: number;
}

interface PlayData {
  players: PlayerIcon[];
  drawings: DrawingElement[];
  annotations: TextAnnotation[];
}

interface PlayerIcon {
  id: string;
  position: { x: number; y: number };
  label: string;
  color: string;
}

interface DrawingElement {
  id: string;
  type: "line" | "curve" | "arrow";
  points: { x: number; y: number }[];
  color: string;
  strokeWidth: number;
}

interface TextAnnotation {
  id: string;
  text: string;
  position: { x: number; y: number };
  fontSize: number;
  color: string;
}
```

**Key Features:**

- Renders standard hockey rink with zones, circles, and lines
- Supports touch and mouse interactions
- Implements undo/redo functionality
- Exports play as PNG for thumbnails
- Responsive scaling for different screen sizes

### 2. DrawingToolbar Component

Provides tool selection and drawing options.

**Props Interface:**

```typescript
interface DrawingToolbarProps {
  selectedTool: DrawingTool;
  selectedColor: string;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

type DrawingTool =
  | "select"
  | "player"
  | "line"
  | "curve"
  | "arrow"
  | "text"
  | "eraser";
```

### 3. PracticeSessionEditor Component

Main editor for creating and organizing practice sessions.

**Props Interface:**

```typescript
interface PracticeSessionEditorProps {
  sessionId?: string;
  teamId: string;
  initialData?: PracticeSessionData;
}

interface PracticeSessionData {
  id?: string;
  title: string;
  date: Date;
  duration: number; // minutes
  plays: PlayInSession[];
  isShared: boolean;
}

interface PlayInSession {
  id: string;
  playId: string;
  sequence: number;
  duration: number; // minutes
  instructions: string;
  playData: PlayData;
}
```

### 4. PlayLibrary Component

Displays saved plays with search and filtering.

**Props Interface:**

```typescript
interface PlayLibraryProps {
  teamId: string;
  onSelectPlay: (play: SavedPlay) => void;
  mode: "select" | "manage";
}

interface SavedPlay {
  id: string;
  name: string;
  description: string;
  thumbnail: string; // base64 PNG
  playData: PlayData;
  createdAt: Date;
  updatedAt: Date;
}
```

## Data Models

### Database Schema Extensions

```prisma
// Practice session model
model PracticeSession {
  id          String   @id @default(cuid())
  title       String
  date        DateTime
  duration    Int      // Total duration in minutes
  isShared    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  teamId      String
  team        Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id])

  plays       PracticeSessionPlay[]

  @@index([teamId, date])
  @@map("practice_sessions")
}

// Junction table for plays in sessions
model PracticeSessionPlay {
  id           String   @id @default(cuid())
  sequence     Int      // Order in the session
  duration     Int      // Duration for this play in minutes
  instructions String?  // Specific instructions for this instance
  createdAt    DateTime @default(now())

  sessionId    String
  session      PracticeSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  playId       String
  play         Play     @relation(fields: [playId], references: [id])

  @@unique([sessionId, sequence])
  @@index([sessionId])
  @@map("practice_session_plays")
}

// Reusable play model
model Play {
  id          String   @id @default(cuid())
  name        String
  description String?
  thumbnail   String?  // Base64 encoded PNG thumbnail
  playData    Json     // Serialized PlayData structure
  isTemplate  Boolean  @default(false) // Library plays vs session-specific
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  teamId      String
  team        Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)

  createdById String
  createdBy   User     @relation(fields: [createdById], references: [id])

  sessions    PracticeSessionPlay[]

  @@index([teamId, isTemplate])
  @@map("plays")
}
```

### JSON Structure for PlayData

The `playData` field stores the complete play information as JSON:

```json
{
  "version": "1.0",
  "rinkDimensions": {
    "width": 200,
    "height": 85
  },
  "players": [
    {
      "id": "player-1",
      "position": { "x": 100, "y": 42.5 },
      "label": "C",
      "color": "#FF0000"
    }
  ],
  "drawings": [
    {
      "id": "draw-1",
      "type": "arrow",
      "points": [
        { "x": 100, "y": 42.5 },
        { "x": 150, "y": 42.5 }
      ],
      "color": "#0000FF",
      "strokeWidth": 2
    }
  ],
  "annotations": [
    {
      "id": "text-1",
      "text": "Breakout drill",
      "position": { "x": 50, "y": 20 },
      "fontSize": 14,
      "color": "#000000"
    }
  ]
}
```

## Error Handling

### Client-Side Error Handling

1. **Canvas Rendering Errors**: Fallback to static image if canvas fails
2. **Touch/Mouse Event Errors**: Graceful degradation to basic interactions
3. **Auto-save Failures**: Show warning banner and retry with exponential backoff
4. **Invalid Play Data**: Validate JSON structure and show error message

### Server-Side Error Handling

1. **Permission Errors**: Return 403 with clear message if user lacks admin role
2. **Validation Errors**: Return 400 with field-specific error messages
3. **Database Errors**: Log error and return 500 with generic message
4. **Notification Failures**: Log error but don't block session sharing

### Error Response Format

```typescript
interface ErrorResponse {
  error: string;
  code: string;
  details?: Record<string, string>;
}
```

## Testing Strategy

### Unit Tests

1. **Canvas Utilities**

   - Test coordinate transformations
   - Test drawing element creation
   - Test collision detection for selection

2. **Data Validation**

   - Test PlayData JSON schema validation
   - Test session duration calculations
   - Test play sequence ordering

3. **Permission Checks**
   - Test admin-only access to edit functions
   - Test team member view access
   - Test cross-team access prevention

### Integration Tests

1. **Practice Session Workflow**

   - Create session → Add plays → Share → View as member
   - Edit shared session → Verify updates propagate
   - Delete session → Verify cascade deletes

2. **Play Library Workflow**

   - Save play to library → Add to session → Edit in session → Verify original unchanged
   - Delete library play → Verify sessions retain copy

3. **Notification Workflow**
   - Share session → Verify emails sent to team members
   - Update shared session → Verify update notifications
   - Respect notification preferences

### Component Tests

1. **RinkBoard Component**

   - Test rendering in edit and view modes
   - Test tool interactions (drawing, selecting, erasing)
   - Test mobile touch events
   - Test undo/redo functionality

2. **PracticeSessionEditor Component**

   - Test adding/removing plays
   - Test reordering plays
   - Test duration validation
   - Test save and share actions

3. **PlayLibrary Component**
   - Test play selection
   - Test search and filtering
   - Test play deletion with confirmation

## Performance Considerations

### Canvas Optimization

- Use requestAnimationFrame for smooth drawing
- Implement dirty rectangle rendering for partial updates
- Debounce auto-save to reduce server requests
- Cache rendered rink background as separate layer

### Database Optimization

- Index on `teamId` and `date` for session queries
- Index on `teamId` and `isTemplate` for library queries
- Use JSON field for flexible play data storage
- Implement pagination for play library (20 items per page)

### Mobile Optimization

- Reduce canvas resolution on smaller screens
- Use touch-optimized hit targets (minimum 44x44px)
- Implement pinch-to-zoom for detailed editing
- Lazy load play thumbnails in library view

## Security Considerations

### Authorization

- Verify team admin role for all create/edit operations
- Verify team membership for view operations
- Prevent cross-team data access
- Validate session and play ownership before operations

### Input Validation

- Sanitize all text inputs (title, instructions, annotations)
- Validate JSON structure for playData
- Limit drawing element counts (max 100 per play)
- Limit annotation text length (max 500 characters)
- Validate duration values (1-300 minutes)

### Data Protection

- Store play data as JSON in database (no file uploads)
- Generate thumbnails server-side to prevent XSS
- Rate limit session creation (max 10 per hour per user)
- Audit log for session sharing actions

## Mobile Responsiveness

### Responsive Breakpoints

- **Mobile (< 768px)**: Single column layout, full-width canvas
- **Tablet (768px - 1024px)**: Two column layout, sidebar for tools
- **Desktop (> 1024px)**: Three column layout, expanded library panel

### Touch Interactions

- **Single tap**: Select element or place player
- **Tap and drag**: Draw lines or move elements
- **Long press**: Open context menu for element
- **Two-finger pinch**: Zoom canvas
- **Two-finger drag**: Pan canvas

### Mobile-Specific Features

- Simplified toolbar with collapsible tool groups
- Bottom sheet for play library on mobile
- Swipe gestures for undo/redo
- Haptic feedback for tool selection

## Integration with Existing Features

### Team Management Integration

- Practice sessions appear in team dashboard
- Link to practice planner from team navigation
- Filter sessions by date range in team calendar
- Display upcoming practice plans in team overview

### Notification Integration

- Reuse existing `NotificationPreference` model
- Add new preference: `practicePlanNotifications`
- Use existing email templates with practice plan content
- Include direct link to view session in email

### Permission Integration

- Leverage existing `TeamMember` role system
- Only `ADMIN` role can create/edit sessions
- All team members can view shared sessions
- Audit log integration for session sharing

## Future Enhancements (Out of Scope for MVP)

- Video attachments for plays
- Animation playback of player movements
- Export session as PDF
- Import plays from other teams
- AI-suggested plays based on team composition
- Real-time collaborative editing
- Integration with practice attendance tracking
