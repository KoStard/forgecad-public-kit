// Placement references let imported parts define semantic attachment points.

const left = require("api/import-placement-widget-source.forge.js")
  .placeReference("mount", [-90, 0, 0]);

const right = require("api/import-placement-widget-source.forge.js", {
  "Post Height": 40,
}).attachTo(left, "objects.post.top", "mount", [90, 0, 0]);

const cap = box(18, 18, 8, true)
  .attachTo(right, "objects.post.top", "bottom")
  .color("#384b5f");

return [
  { name: "Left", shape: left, color: "#5b7c8d" },
  { name: "Right", shape: right, color: "#d38b4d" },
  { name: "Cap", shape: cap },
];
