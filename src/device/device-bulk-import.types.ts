export type BulkDeviceDefinition = {
  serialNumber: string;
  name: string;
  type: string;
  model: string;
  version: string;
};

export type BulkDeviceRepositoryResult = {
  targetUser: {
    id: number;
    email: string;
  } | null;
  missingModelVersions: string[];
  existingSerialNumbers: string[];
  attemptedCreates: number;
  created: number;
};
