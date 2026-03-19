mod testkit;

use solver::types::SolveOptions;
use testkit::{assert_svg_snapshot, TestSketch};

#[test]
fn rect_svg_snapshot_stays_stable() {
    let mut sketch = TestSketch::new();
    let rect = sketch.rect("frame", 20.0, 30.0, 120.0, 60.0);

    sketch.fix("fix-origin", &rect.points[0], 20.0, 30.0);
    sketch.horizontal("bottom-horizontal", &rect.lines[0]);
    sketch.vertical("right-vertical", &rect.lines[1]);
    sketch.horizontal("top-horizontal", &rect.lines[2]);
    sketch.vertical("left-vertical", &rect.lines[3]);
    sketch.length("bottom-length", &rect.lines[0], 120.0);
    sketch.length("left-length", &rect.lines[3], 60.0);
    sketch.ccw(
        "keep-ccw",
        &[
            rect.points[0].as_str(),
            rect.points[1].as_str(),
            rect.points[2].as_str(),
            rect.points[3].as_str(),
        ],
    );
    sketch.block_rotation(
        "keep-upright",
        &[
            rect.points[0].as_str(),
            rect.points[1].as_str(),
            rect.points[2].as_str(),
            rect.points[3].as_str(),
        ],
        "x",
    );

    let solved = sketch.solve(Some(SolveOptions {
        iterations: Some(80),
        tolerance: Some(1e-6),
        restarts: Some(4),
        warm_start_iterations: Some(8),
        max_scaled_step: Some(2.5),
        skip_redundancy_check: Some(false),
    }));
    solved.assert_solved(1e-6);

    assert_svg_snapshot("rect_upright", &solved.render_svg());
}
