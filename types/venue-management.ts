export type VenueOrganizationType =
  | 'RINK'
  | 'ARENA'
  | 'SKATING_CENTER'
  | 'SPORTS_COMPLEX'
  | 'OTHER';

export type VenueOrganizationStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

export type VenueProfileStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';

export type VenueStaffRole =
  | 'OWNER'
  | 'MANAGER'
  | 'SCHEDULER'
  | 'CONTENT_EDITOR'
  | 'REQUEST_MANAGER'
  | 'VIEWER';

export type VenueStaffStatus = 'INVITED' | 'ACTIVE' | 'REMOVED';

export type IceSurfaceType = 'ICE' | 'STUDIO' | 'ROOM' | 'DRYLAND' | 'TURF' | 'COURT' | 'FIELD' | 'OTHER';

export type OperatingHourStatus = 'OPEN' | 'CLOSED' | 'RESTRICTED';

export type VenueScheduleActivityType =
  | 'OPEN_SKATE'
  | 'STICK_AND_PICK'
  | 'FREE_SKATE'
  | 'FIGURE_SKATING'
  | 'SPECIALTY_EVENT'
  | 'PRIVATE_LESSON'
  | 'PUBLIC_LESSON'
  | 'TEAM_ICE'
  | 'ORGANIZATION_ICE'
  | 'RENTAL'
  | 'CLOSURE'
  | 'CUSTOM';

export type VenueScheduleAudience =
  | 'PUBLIC'
  | 'TEAMS'
  | 'COACHES'
  | 'ORGANIZATIONS'
  | 'INVITE_ONLY'
  | 'STAFF_ONLY';

export type VenueScheduleVisibility =
  | 'PUBLIC'
  | 'AUTHENTICATED'
  | 'RELATIONSHIP_ONLY'
  | 'PRIVATE';

export type VenueScheduleBlockStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELED' | 'ARCHIVED';

export type RegistrationMode = 'INFO_ONLY' | 'REQUEST_REQUIRED' | 'EXTERNAL_REGISTRATION';

export type IceTimeRequestStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CANCELED'
  | 'EXPIRED';

export type LessonOfferingType = 'PRIVATE' | 'SEMI_PRIVATE' | 'GROUP' | 'CLINIC' | 'CAMP';

export type ContentPostStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';

export type VenueRelationshipType = 'PREFERRED' | 'HOME';

export type VenueRelationshipTargetType = 'TEAM' | 'LEAGUE' | 'COACH' | 'ORGANIZATION';

export type VenueRelationshipStatus = 'PENDING' | 'ACTIVE' | 'REJECTED' | 'REMOVED' | 'EXPIRED';

export type SkillLevelSource = 'USA_HOCKEY' | 'US_FIGURE_SKATING' | 'RINK_CUSTOM' | 'OTHER';

export type SkillLevelDiscipline = 'HOCKEY' | 'FIGURE_SKATING' | 'SKATING' | 'GOALIE' | 'OTHER';

export interface PublicRinkSummary {
  id: string;
  slug: string;
  name: string;
  publicDescription: string | null;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  brandSecondaryColor: string | null;
  city: string | null;
  state: string | null;
  surfaceCount: number;
}
