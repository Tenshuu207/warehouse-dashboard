import SettingsListPage from "@/components/settings-list-page";

export default function ReviewStatusesSettingsPage() {
  return (
    <SettingsListPage
      title="Review Statuses"
      description="Manage the allowed review status values used by the review workflow."
      fieldName="reviewStatuses"
      fieldLabel="Review Statuses"
      saveLabel="Save Review Statuses"
    />
  );
}
