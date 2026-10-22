import jwt from 'jsonwebtoken'

export const JWT_FALLBACK_SECRET = 'hopr-secret-key'
// Tokens are signed and accepted with this algorithm only
export const JWT_ALGORITHM = 'HS256'

export function jwtSecret() {
  return process.env.JWT_SECRET || JWT_FALLBACK_SECRET
}

// 7-day expiry is a documented tradeoff (see README); tokenVersion allows revocation.
export function generateToken(user) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, tokenVersion: user.tokenVersion },
    jwtSecret(),
    { expiresIn: '7d', algorithm: JWT_ALGORITHM }
  )
}
