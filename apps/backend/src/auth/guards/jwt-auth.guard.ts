import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Guards a route, requiring a valid access token (Bearer). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
