const postHeight = param("Post Height", 26, { min: 12, max: 60, unit: "mm" });

const base = box(48, 32, 8, true);
const post = cylinder(postHeight, 5, undefined, undefined, true)
  .translate(12, 0, 4 + postHeight / 2);

return union(base, post)
  .withReferences({
    points: {
      mount: [0, -16, -4],
      postCenter: [12, 0, 4 + postHeight / 2],
    },
    edges: {
      postAxis: {
        start: [12, 0, 4],
        end: [12, 0, 4 + postHeight],
      },
    },
    surfaces: {
      mountingFace: {
        center: [0, -16, 0],
        normal: [0, -1, 0],
      },
    },
    objects: {
      base,
      post,
    },
  })
  .color("#5b7c8d");
