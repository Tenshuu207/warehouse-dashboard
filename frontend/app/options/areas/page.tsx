import SettingsListPage from "@/components/settings-list-page";

export default function AreasSettingsPage() {
  return (
    <SettingsListPage
      title="Areas"
      description="Manage the list of valid warehouse teams and areas used across the app."
      fieldName="areas"
      fieldLabel="Areas"
      saveLabel="Save Areas"
    />
  );
}
