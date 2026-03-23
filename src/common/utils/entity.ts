export const getEntityId = (entity: unknown): string => {
  if (entity && typeof entity === "object") {
    const record = entity as { id?: unknown; _id?: unknown };

    if (typeof record.id === "string") {
      return record.id;
    }

    if (record._id && typeof (record._id as { toString?: () => string }).toString === "function") {
      return (record._id as { toString: () => string }).toString();
    }
  }

  throw new Error("Unable to resolve entity id");
};
