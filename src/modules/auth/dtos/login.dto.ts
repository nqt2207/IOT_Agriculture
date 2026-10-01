import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty } from "class-validator";
import { IsStrongPassword} from "src/commons/decorators/is-strong-password.decorator";
export class LoginDto {
    @ApiProperty({example: 'user1@gmail.com'})
    @IsEmail()
    @IsNotEmpty()
    email: string; 

    @ApiProperty({example: 'User1234567@'})
    @IsStrongPassword()
    @IsNotEmpty()
    password: string;
}

