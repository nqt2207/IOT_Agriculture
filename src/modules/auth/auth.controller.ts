import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { RefreshTokenDto } from './dtos/refresh-token.dto';
import { Public } from 'src/commons/decorators/public.decorator';



@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService){}

    // @Public()
    // @Post('register')
    // registerUser(@Body() body: RegisterUserDto) {
    //     return this.authService.registerUser(body);
    // }

    @Public()
    @Post('login')
    login(@Body() body: LoginDto) {
        return this.authService.login(body);
    }


    @Post('refresh')
    refresh(@Body() body: RefreshTokenDto){
        return this.authService.refresh(body);
    }

    // @Public()
    // @Post('login-google')
    // loginGoogle(@Body() body: LoginGoogleDto){
    //     return this.authService.loginGoogle(body);
    // }

}
