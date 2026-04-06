import SettingsListPage from "@/components/settings-list-page";

export default function RolesSettingsPage() {
  return (
    <SettingsListPage
      title="Roles"
      description="Manage the list of valid operational roles used in review and reporting."
      fieldName="roles"
      fieldLabel="Roles"
      saveLabel="Save Roles"
    />
  );
}
