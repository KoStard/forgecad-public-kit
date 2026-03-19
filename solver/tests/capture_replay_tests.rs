mod helpers;
mod testkit;

use helpers::{assert_solved, fixed_point, line, problem, point};
use solver::{replay_solve_exchange_json, solve_problem};
use solver::types::{Constraint, SolveExchange, SolveExchangeKind};
use testkit::solve_captured_exchange_json;

#[test]
fn captured_solve_exchange_replays_from_json() {
    let request = problem(
        vec![fixed_point("a", 0.0, 0.0), point("b", 7.0, 3.0)],
        vec![line("l1", "a", "b")],
        vec![
            Constraint::Horizontal {
                id: "c-horizontal".into(),
                line: "l1".into(),
            },
            Constraint::Length {
                id: "c-length".into(),
                line: "l1".into(),
                value: 12.0,
            },
        ],
    );
    let response = solve_problem(request.clone(), request.options.clone());
    let exchange = SolveExchange {
        kind: SolveExchangeKind::Solve,
        constraint_id: None,
        request,
        response,
    };
    let json = serde_json::to_string_pretty(&exchange).unwrap();

    let replayed = replay_solve_exchange_json(&json).unwrap();
    assert_solved(&replayed, 1e-3, "captured replay");

    let solved = solve_captured_exchange_json(&json);
    solved.assert_solved(1e-3);
    let (_ax, ay) = solved.point("a");
    let (_bx, by) = solved.point("b");
    assert!((ay - by).abs() <= 1e-3, "captured replay lost horizontal constraint");
}
