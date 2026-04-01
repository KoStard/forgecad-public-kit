/// Symmetric positive-definite solve via Cholesky factorisation.
/// Returns None if the matrix is not positive definite.
pub fn solve_cholesky(a: &[Vec<f64>], b: &[f64]) -> Option<Vec<f64>> {
    let n = a.len();
    let mut l = vec![vec![0.0f64; n]; n];

    for i in 0..n {
        for j in 0..=i {
            let mut sum: f64 = 0.0;
            for k in 0..j {
                sum += l[i][k] * l[j][k];
            }
            if i == j {
                let val = a[i][i] - sum;
                if val <= 0.0 {
                    return None;
                }
                l[i][i] = val.sqrt();
            } else {
                l[i][j] = (a[i][j] - sum) / l[j][j];
            }
        }
    }

    // Forward substitution: L y = b
    let mut y = vec![0.0f64; n];
    for i in 0..n {
        let mut sum: f64 = 0.0;
        for k in 0..i {
            sum += l[i][k] * y[k];
        }
        y[i] = (b[i] - sum) / l[i][i];
    }

    // Back substitution: L^T x = y
    let mut x = vec![0.0f64; n];
    for i in (0..n).rev() {
        let mut sum: f64 = 0.0;
        for k in (i + 1)..n {
            sum += l[k][i] * x[k];
        }
        x[i] = (y[i] - sum) / l[i][i];
    }

    Some(x)
}

/// Gaussian elimination with partial pivoting — fallback for degenerate systems.
pub fn solve_gaussian(a: &[Vec<f64>], b: &[f64]) -> Vec<f64> {
    let n = a.len();
    // Build augmented matrix [A | b]
    let mut aug: Vec<Vec<f64>> = a
        .iter()
        .enumerate()
        .map(|(i, row)| {
            let mut r = row.clone();
            r.push(b[i]);
            r
        })
        .collect();

    for i in 0..n {
        // Partial pivot
        let mut pivot_row = i;
        let mut pivot_abs = aug[i][i].abs();
        for r in (i + 1)..n {
            let v = aug[r][i].abs();
            if v > pivot_abs {
                pivot_abs = v;
                pivot_row = r;
            }
        }
        aug.swap(i, pivot_row);

        if pivot_abs < 1e-14 {
            continue;
        }

        for r in (i + 1)..n {
            let factor = aug[r][i] / aug[i][i];
            for c in i..=n {
                let val = aug[i][c] * factor;
                aug[r][c] -= val;
            }
        }
    }

    // Back substitution
    let mut x = vec![0.0f64; n];
    for i in (0..n).rev() {
        if aug[i][i].abs() < 1e-14 {
            x[i] = 0.0;
            continue;
        }
        let mut val = aug[i][n];
        for c in (i + 1)..n {
            val -= aug[i][c] * x[c];
        }
        x[i] = val / aug[i][i];
    }

    x
}

/// Solve A x = b, trying Cholesky first, falling back to Gaussian.
pub fn solve_linear(a: &[Vec<f64>], b: &[f64]) -> Vec<f64> {
    solve_cholesky(a, b).unwrap_or_else(|| solve_gaussian(a, b))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(a: f64, b: f64) -> bool {
        (a - b).abs() < 1e-10
    }

    #[test]
    fn cholesky_identity() {
        let a = vec![vec![1.0, 0.0], vec![0.0, 1.0]];
        let b = vec![3.0, 7.0];
        let x = solve_cholesky(&a, &b).unwrap();
        assert!(approx_eq(x[0], 3.0));
        assert!(approx_eq(x[1], 7.0));
    }

    #[test]
    fn cholesky_symmetric_pd() {
        // [ 4  2 ]       [ 2 ]
        // [ 2  3 ] x  =  [ 2 ]
        // Solution: x = [0.25, 0.5]
        let a = vec![vec![4.0, 2.0], vec![2.0, 3.0]];
        let b = vec![2.0, 2.0];
        let x = solve_cholesky(&a, &b).unwrap();
        // Check: 4*0.25 + 2*0.5 = 1+1 = 2  ✓
        //        2*0.25 + 3*0.5 = 0.5+1.5 = 2  ✓
        assert!(approx_eq(4.0 * x[0] + 2.0 * x[1], 2.0));
        assert!(approx_eq(2.0 * x[0] + 3.0 * x[1], 2.0));
    }

    #[test]
    fn cholesky_not_pd_returns_none() {
        // Not positive definite
        let a = vec![vec![-1.0, 0.0], vec![0.0, 1.0]];
        let b = vec![1.0, 1.0];
        assert!(solve_cholesky(&a, &b).is_none());
    }

    #[test]
    fn gaussian_3x3() {
        // [ 2 1 -1 ]       [ 8  ]
        // [-3 -1  2] x  =  [-11 ]
        // [-2  1  2]       [-3  ]
        // Solution: x = [2, 3, -1]
        let a = vec![
            vec![2.0, 1.0, -1.0],
            vec![-3.0, -1.0, 2.0],
            vec![-2.0, 1.0, 2.0],
        ];
        let b = vec![8.0, -11.0, -3.0];
        let x = solve_gaussian(&a, &b);
        assert!(approx_eq(x[0], 2.0));
        assert!(approx_eq(x[1], 3.0));
        assert!(approx_eq(x[2], -1.0));
    }

    #[test]
    fn solve_linear_dispatches_cholesky() {
        let a = vec![vec![4.0, 2.0], vec![2.0, 3.0]];
        let b = vec![2.0, 2.0];
        let x = solve_linear(&a, &b);
        assert!(approx_eq(4.0 * x[0] + 2.0 * x[1], 2.0));
    }
}
