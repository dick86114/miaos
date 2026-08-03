export function createLargeStateFixture({ historyCount = 200, projectCount = 50, versionCount = 100 } = {}) {
  return {
    providers: [],
    history: Array.from({ length: historyCount }, (_, index) => ({ id: `h_${index}`, createdAt: index })),
    projects: Array.from({ length: projectCount }, (_, index) => ({
      id: `p_${index}`,
      name: `测试项目 ${index}`,
      versions: Array.from({ length: Math.ceil(versionCount / projectCount) }, (_, versionIndex) => ({
        id: `v_${index}_${versionIndex}`,
        parentId: null,
        images: [],
      })),
    })),
    defaults: {},
    lastSettings: null,
    updateRepo: 'dick86114/miaos',
  };
}
