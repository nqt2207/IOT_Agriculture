import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";
import { IsStrongPassword} from "src/commons/decorators/is-strong-password.decorator";
export class RefreshTokenDto {
    @ApiProperty({
        example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNzg0Mjk5MjY1LCJleHAiOjE3ODQ5MDQwNjV9.q8Mnf9X9pKkTKD6g9KqYjNHDWOWumru8pPq0u4loJm8'
    })
    @IsString()
    @IsNotEmpty()
    refreshToken: string;
}

