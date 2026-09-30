export interface UpgradePolicy {
  performanceAndSecurityUpdatesThroughoutYear: true;
  majorSoftwareUpgradeCadence: "annual";
  fileMutationAllowed: false;
}

export const upgradePolicy: UpgradePolicy = {
  performanceAndSecurityUpdatesThroughoutYear: true,
  majorSoftwareUpgradeCadence: "annual",
  fileMutationAllowed: false
};
