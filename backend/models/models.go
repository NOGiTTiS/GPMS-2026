package models

import (
	"time"
)

type UserRole string

const (
	RoleAdmin   UserRole = "admin"
	RoleTeacher UserRole = "teacher"
	RoleStudent UserRole = "student"
)

type User struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"unique;not null" json:"username"`
	PasswordHash string    `gorm:"not null" json:"-"`
	FullName     string    `gorm:"not null" json:"full_name"`
	Email        string    `json:"email"`
	Role         UserRole  `gorm:"type:varchar(20);not null" json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type Semester struct {
	ID       uint `gorm:"primaryKey" json:"id"`
	Year     int  `gorm:"not null" json:"year"`
	Term     int  `gorm:"not null" json:"term"`
	IsActive bool `gorm:"default:false" json:"is_active"`
}

type Classroom struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	Name       string    `gorm:"not null" json:"name"`
	SemesterID uint      `gorm:"not null" json:"semester_id"`
	Semester   Semester  `gorm:"foreignKey:SemesterID;constraint:OnDelete:CASCADE" json:"semester,omitempty"`
	Teachers   []User    `gorm:"many2many:classroom_teachers;constraint:OnDelete:CASCADE;" json:"teachers,omitempty"`
	Students   []Student `gorm:"foreignKey:ClassroomID;constraint:OnDelete:CASCADE" json:"students,omitempty"`
}

type Student struct {
	UserID      uint      `gorm:"primaryKey" json:"user_id"`
	User        User      `gorm:"foreignKey:UserID;constraint:OnDelete:CASCADE" json:"user,omitempty"`
	ClassroomID uint      `gorm:"not null" json:"classroom_id"`
	Classroom   Classroom `gorm:"foreignKey:ClassroomID;constraint:OnDelete:CASCADE" json:"classroom,omitempty"`
}

type Group struct {
	ID               uint        `gorm:"primaryKey" json:"id"`
	Name             string      `gorm:"not null" json:"name"`
	ProjectTopic     string      `gorm:"not null" json:"project_topic"`
	LeaderStudentID  uint        `gorm:"not null" json:"leader_student_id"`
	LeaderStudent    User        `gorm:"foreignKey:LeaderStudentID" json:"leader_student,omitempty"`
	ClassroomID      uint        `gorm:"not null" json:"classroom_id"`
	Classroom        Classroom   `gorm:"foreignKey:ClassroomID;constraint:OnDelete:CASCADE" json:"classroom,omitempty"`
	SemesterID       uint        `gorm:"not null" json:"semester_id"`
	Semester         Semester    `gorm:"foreignKey:SemesterID;constraint:OnDelete:CASCADE" json:"semester,omitempty"`
	Members          []User      `gorm:"many2many:group_members;joinForeignKey:GroupID;joinReferences:StudentID;constraint:OnDelete:CASCADE;" json:"members,omitempty"`
	Submissions      []Submission `gorm:"foreignKey:GroupID;constraint:OnDelete:CASCADE" json:"submissions,omitempty"`
	CreatedAt        time.Time   `json:"created_at"`
}

type GroupMember struct {
	GroupID   uint      `gorm:"primaryKey" json:"group_id"`
	StudentID uint      `gorm:"primaryKey" json:"student_id"`
	JoinedAt  time.Time `gorm:"default:CURRENT_TIMESTAMP" json:"joined_at"`
}

type GroupActivityLog struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	GroupID     uint      `gorm:"not null" json:"group_id"`
	Group       Group     `gorm:"foreignKey:GroupID;constraint:OnDelete:CASCADE" json:"-"`
	ActionByID  uint      `gorm:"not null" json:"action_by_id"`
	ActionBy    User      `gorm:"foreignKey:ActionByID" json:"action_by,omitempty"`
	ActionType  string    `gorm:"not null" json:"action_type"` // 'MEMBER_REMOVE', 'MEMBER_LEAVE', 'TOPIC_CHANGE', etc.
	Description string    `gorm:"not null" json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

type WorkloadType string

const (
	WorkloadTypeIndividual WorkloadType = "individual"
	WorkloadTypeGroup      WorkloadType = "group"
)

type Workload struct {
	ID             uint         `gorm:"primaryKey" json:"id"`
	SemesterID     uint         `gorm:"not null" json:"semester_id"`
	Semester       Semester     `gorm:"foreignKey:SemesterID;constraint:OnDelete:CASCADE" json:"semester,omitempty"`
	Title          string       `gorm:"not null" json:"title"`
	Description    string       `json:"description"`
	Deadline       time.Time    `gorm:"not null" json:"deadline"`
	MaxScore       float64      `gorm:"type:decimal(5,2);not null" json:"max_score"`
	SampleFilePath string       `json:"sample_file_path"`
	SampleLinkURL  string       `json:"sample_link_url"`
	Type           WorkloadType `gorm:"type:varchar(20);default:'group';not null" json:"type"`
	IsOpen         bool         `gorm:"default:true" json:"is_open"`
	AllowLate      bool         `gorm:"default:true" json:"allow_late"`
	CreatedAt      time.Time    `json:"created_at"`
}

type Submission struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	WorkloadID    uint           `gorm:"not null" json:"workload_id"`
	Workload      Workload       `gorm:"foreignKey:WorkloadID;constraint:OnDelete:CASCADE" json:"workload,omitempty"`
	GroupID       *uint          `json:"group_id,omitempty"`
	Group         *Group         `gorm:"foreignKey:GroupID;constraint:OnDelete:CASCADE" json:"group,omitempty"`
	StudentID     uint           `gorm:"index;not null" json:"student_id"`
	Student       User           `gorm:"foreignKey:StudentID" json:"student,omitempty"`
	SubmittedByID uint           `gorm:"not null" json:"submitted_by_id"`
	SubmittedBy   User           `gorm:"foreignKey:SubmittedByID" json:"submitted_by,omitempty"`
	FilePath      string         `json:"file_path"`
	LinkURL       string         `json:"link_url"`
	SubmittedAt   time.Time      `json:"submitted_at"`
	IsLate        bool           `gorm:"default:false" json:"is_late"`
	Grade         *WorkloadGrade `gorm:"foreignKey:SubmissionID;constraint:OnDelete:CASCADE" json:"grade,omitempty"`
}

type WorkloadGrade struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	SubmissionID uint      `gorm:"uniqueIndex;not null;constraint:OnDelete:CASCADE" json:"submission_id"`
	GradedByID   uint      `gorm:"not null" json:"graded_by_id"`
	GradedBy     User      `gorm:"foreignKey:GradedByID" json:"graded_by,omitempty"`
	Score        float64   `gorm:"type:decimal(5,2);not null" json:"score"`
	Comment      string    `json:"comment"`
	GradedAt     time.Time `json:"graded_at"`
}

type FinalProjectSubmission struct {
	ID            uint                 `gorm:"primaryKey" json:"id"`
	GroupID       uint                 `gorm:"uniqueIndex;not null" json:"group_id"`
	Group         Group                `gorm:"foreignKey:GroupID;constraint:OnDelete:CASCADE" json:"group,omitempty"`
	VideoPath     string               `json:"video_path"`
	VideoLink     string               `json:"video_link"`
	SubmittedByID uint                 `gorm:"not null" json:"submitted_by_id"`
	SubmittedBy   User                 `gorm:"foreignKey:SubmittedByID" json:"submitted_by,omitempty"`
	SubmittedAt   time.Time            `json:"submitted_at"`
	Grades        []FinalProjectGrade  `gorm:"foreignKey:FinalProjectSubmissionID;constraint:OnDelete:CASCADE" json:"grades,omitempty"`
}

type FinalProjectCriteria struct {
	ID         uint     `gorm:"primaryKey" json:"id"`
	SemesterID uint     `gorm:"not null" json:"semester_id"`
	Semester   Semester `gorm:"foreignKey:SemesterID;constraint:OnDelete:CASCADE" json:"semester,omitempty"`
	Title      string   `gorm:"not null" json:"title"`
	MaxScore   float64  `gorm:"type:decimal(5,2);not null" json:"max_score"`
	Weight     float64  `gorm:"type:decimal(5,2);not null" json:"weight"` // Weight percentage e.g. 40.00
}

type FinalProjectGrade struct {
	ID                        uint                   `gorm:"primaryKey" json:"id"`
	FinalProjectSubmissionID uint                   `gorm:"not null;constraint:OnDelete:CASCADE" json:"final_project_submission_id"`
	CriteriaID                uint                   `gorm:"not null" json:"criteria_id"`
	Criteria                  FinalProjectCriteria   `gorm:"foreignKey:CriteriaID;constraint:OnDelete:CASCADE" json:"criteria,omitempty"`
	TeacherID                 uint                   `gorm:"not null" json:"teacher_id"`
	Teacher                   User                   `gorm:"foreignKey:TeacherID" json:"teacher,omitempty"`
	Score                     float64                `gorm:"type:decimal(5,2);not null" json:"score"`
	Comment                   string                 `json:"comment"`
	GradedAt                  time.Time              `json:"graded_at"`
}

type SystemSetting struct {
	SettingKey   string `gorm:"primaryKey;type:varchar(100)" json:"setting_key"`
	SettingValue string `gorm:"type:text" json:"setting_value"`
}
